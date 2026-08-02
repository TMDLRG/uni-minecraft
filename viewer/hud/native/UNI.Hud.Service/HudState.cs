// HudState.cs — shared in-memory state (ring buffers, audience, sight cache).
// One instance held by the DI container; PollWorker writes it, HttpApiHost reads it.

namespace UNI.Hud.Service;

public sealed class HudState
{
    public DateTime StartedAt { get; } = DateTime.UtcNow;
    public long PollCount { get; set; }
    public DateTime? LastPollAt { get; set; }
    public string? GitCommit { get; set; }
    // The MVID of THIS running assembly — the .NET boot-identity of the loaded bytes (see BuildIdentity.cs).
    // Distinct from GitCommit (repo HEAD at boot): the MVID changes with every build, so it catches a stale
    // process serving an old assembly even when the commit looks current.
    public string? ModuleVersionId { get; set; }
    // The loop's MEASURED period (EWMA). Null until two loops have run. The snapshot reports this
    // next to the nominal interval so a dragged loop is visible instead of asserted away.
    public double? MeasuredIntervalMs { get; set; }

    public Ring StackRing        { get; } = new(720);
    public Ring AudienceCountRing{ get; } = new(720);
    // Kept as INTERNAL diagnostics only — these measure the HUD's own plumbing, not the broadcast,
    // so they are deliberately NOT drawn on the glance surface (2026-07-16: the old "launcher 1797ms"
    // line was exactly this mistake — it told the operator nothing about the show).
    public Ring LauncherLatRing  { get; } = new(720);
    public Ring GaiaLatRing      { get; } = new(720);

    // ---- MIXER-BOARD rings (2026-07-16) --------------------------------------------------------
    // Every one of these is a CONTINUOUS MAGNITUDE from a real upstream field. The retired
    // ProducerUpRing was a 0/1 binary drawn as a line chart — structurally incapable of showing
    // anything but a flat line (gate: hud-speeds-meaningful). Binaries are pills, not charts.
    public Ring ColonyFrameRateRing { get; } = new(720);  // Δ mission.colony.frame / Δt  → "the colony is thinking"
    public Ring OutputFpsRing       { get; } = new(720);  // Δ mission.air.frames  / Δt  → real encoder throughput
    public Ring CongestionRing      { get; } = new(720);  // mission.air.congestion 0..1
    public Ring DroppedPctRing      { get; } = new(720);  // air.skipped / air.frames * 100
    public Ring EgressReadersRing   { get; } = new(720);  // MediaMTX uni path readers (numeric)
    public Ring TpsRing             { get; } = new(720);  // mission.colony.tps.tps (20.0 nominal)

    // Delta sources for the two rate rings. Null until a second sample exists — a rate is
    // UNKNOWABLE from one sample, and we push null (a real "no value") rather than a fake 0.
    public long? LastColonyFrame { get; set; }
    public DateTime? LastColonyFrameAt { get; set; }

    // 2026-07-17 · gate `colony-frozen-needs-dwell-not-one-sample`. FOUND LIVE, not by reading code:
    // the HUD printed red "COLONY frames/s 0.0 · FROZEN — frame not advancing" while the producer's
    // own counter went 33718 -> 33720 across 6s. The colony was FINE. Rate() differences ONE
    // consecutive pair, and the colony advances ~1 frame per ~3s against a 3.0s poll — the sample
    // interval EQUALS the event interval, so a Δ of 0 is aliasing noise, not a frozen mind. A
    // healthy colony flickers into a red alarm forever, and a false alarm spends trust that does
    // not refill.
    //
    // Liveness must be measured in WALL CLOCK against the last OBSERVED CHANGE, which is immune to
    // the tick rate entirely: stamp when the counter actually moved, and let the consumer compare
    // that to a dwell. No threshold here is keyed to the nominal 3000ms — the loop has genuinely
    // run at 11.1s and 18.5s under load.
    public long? LastChangedColonyFrameValue { get; set; }
    public DateTime? ColonyFrameLastChangedAt { get; set; }
    public long? LastOutputFrames { get; set; }
    public DateTime? LastOutputFramesAt { get; set; }

    // ---- Gaia rollup (slow loop; see PollWorker) ----
    public List<GaiaSeat> GaiaSeats { get; set; } = new();
    public List<DriftRow> GaiaDrift { get; set; } = new();
    public DateTime? GaiaPolledAt { get; set; }
    public string? GaiaErr { get; set; }

    public Audience Audience { get; } = new(200);

    public Dictionary<string, UpstreamResult> LastUpstreams { get; set; } = new();
    public Dictionary<string, bool?> LastUpByUpstream { get; } = new();

    // Sight
    public Dictionary<string, DateTime> SightSince { get; } = new();
    public HashSet<string> LastSightCodes { get; set; } = new();
    public SightEnvelope? LastSight { get; set; }

    // User-mode helper's pushed findings (from /api/hud/sight/push)
    public List<SightFinding> UserSightFindings { get; set; } = new();
    public DateTime? UserSightLastPushAt { get; set; }
    public string? UserSightLastPushFrom { get; set; }

    // Gate ledger cache
    public List<GateRow> GatesCache { get; set; } = new();
    public bool GatesOk { get; set; }
    public string? GatesErr { get; set; }
}

public sealed class Ring
{
    private readonly (DateTime ts, double? value)[] _buf;
    private int _head;
    public int Size { get; private set; }
    public int Cap { get; }
    private DateTime _lastTs = DateTime.MinValue;

    public Ring(int cap) { Cap = cap; _buf = new (DateTime, double?)[cap]; }

    public void Push(double? value, DateTime? tsOpt = null)
    {
        var ts = tsOpt ?? DateTime.UtcNow;
        if (ts <= _lastTs) ts = _lastTs.AddTicks(1);
        _lastTs = ts;
        _buf[_head] = (ts, value);
        _head = (_head + 1) % Cap;
        if (Size < Cap) Size++;
    }

    public double?[] Sparkline(int n)
    {
        var k = Math.Min(Math.Max(0, n), Size);
        if (k == 0) return Array.Empty<double?>();
        var out_ = new double?[k];
        var start = Size < Cap ? 0 : _head;
        var offset = Size - k;
        for (int i = 0; i < k; i++) out_[i] = _buf[(start + offset + i) % Cap].value;
        return out_;
    }
}

public sealed class Audience
{
    private readonly List<AudienceRow> _rows;
    public int Cap { get; }
    public int Size => _rows.Count;
    private readonly Lock _lock = new();

    public Audience(int cap) { Cap = cap; _rows = new(cap); }

    // NOTE: input MUST be a System.Text.Json.JsonElement. This was previously typed as
    // `dynamic`, which for a JsonElement (a sealed struct with no IDynamicMetaObjectProvider)
    // meant every `input?.source`-style access threw RuntimeBinderException on the first
    // touch -- caught by the try/catch below and reported as a generic "shape" error. In
    // other words POST /api/hud/audience/publish silently rejected every single request
    // since this service was first written; the endpoint has never actually worked until
    // this fix. Explicit JsonElement API only from here on -- no `dynamic`.
    public (bool ok, string? errCode, string? errMsg, AudienceRow? row) Accept(System.Text.Json.JsonElement input)
    {
        try
        {
            string? GetStr(string name) =>
                input.ValueKind == System.Text.Json.JsonValueKind.Object &&
                input.TryGetProperty(name, out var v) &&
                v.ValueKind == System.Text.Json.JsonValueKind.String
                    ? v.GetString() : null;

            var source = GetStr("source");
            var author = GetStr("author");
            var text = GetStr("text");
            var sanBy = GetStr("sanitized_by");

            if (string.IsNullOrEmpty(source) || System.Text.Encoding.UTF8.GetByteCount(source!) > 200)
                return (false, "source", "source: non-empty string <=200 utf8 bytes", null);
            if (string.IsNullOrEmpty(author) || System.Text.Encoding.UTF8.GetByteCount(author!) > 200)
                return (false, "author", "author: non-empty string <=200 utf8 bytes", null);
            if (string.IsNullOrEmpty(text) || System.Text.Encoding.UTF8.GetByteCount(text!) > 200)
                return (false, "text", "text: non-empty string <=200 utf8 bytes", null);
            if (string.IsNullOrEmpty(sanBy))
                return (false, "sanitized_by", "sanitized_by required: HUD does not sanitize itself; upstream must vouch (hud-audience-sanitizer-honest gate)", null);

            long tsMs;
            if (input.ValueKind == System.Text.Json.JsonValueKind.Object && input.TryGetProperty("ts", out var tsEl))
            {
                if (tsEl.ValueKind == System.Text.Json.JsonValueKind.Number && tsEl.TryGetInt64(out var tsNum)) tsMs = tsNum;
                else if (tsEl.ValueKind == System.Text.Json.JsonValueKind.String && DateTimeOffset.TryParse(tsEl.GetString(), out var dto)) tsMs = dto.ToUnixTimeMilliseconds();
                else return (false, "ts", "ts: unix-ms number or ISO-8601 string", null);
            }
            else return (false, "ts", "ts required", null);

            var row = new AudienceRow(
                source: source!.Replace("<","").Replace(">",""),
                author: author!.Replace("<","").Replace(">",""),
                text: text!.Replace("<","").Replace(">",""),
                ts: tsMs, sanitizedBy: sanBy!, receivedAt: DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            lock (_lock)
            {
                _rows.Add(row);
                if (_rows.Count > Cap) _rows.RemoveRange(0, _rows.Count - Cap);
            }
            return (true, null, null, row);
        }
        catch (Exception e) { return (false, "shape", e.Message, null); }
    }

    public IReadOnlyList<AudienceRow> Recent(int n)
    {
        lock (_lock)
        {
            var k = Math.Min(Math.Max(0, n), _rows.Count);
            return _rows.GetRange(_rows.Count - k, k);
        }
    }
}

public record AudienceRow(string source, string author, string text, long ts, string sanitizedBy, long receivedAt);
public record UpstreamResult(string Name, bool? Up, int Status, int LatencyMs, string? Err, string Url, object? Body);
public record GateRow(string name, string verdict, string? evidence_class, string? phase, string? last_updated, string? receipt_path = null);
// One Gaia seat, counted CLIENT-side. GAIA LAW forbids Gaia from computing counts/rollups about
// herself; a downstream consumer may. up/down/unknown come from each signal's own live.up
// (only tcp/http signals carry one) — never inferred. A seat with no collector (e.g. `relay`)
// honestly reports signal_count 0, which the UI renders as "unimplemented", not as healthy.
public record GaiaSeat(string seat, int signal_count, int up, int down, int unknown);
// A drift signal's REAL result. The old HUD kept only `id` and dropped `equal` — i.e. it showed
// the name of a check while discarding whether it passed (gate: hud-gaia-honest-seats).
public record DriftRow(string id, bool? equal);
public record SightFinding(string code, string severity, string title, string detail, string source, long since_ms, string? pushed_from = null);
public record SightEnvelope(string updated_at, int total, SightCounts counts, List<SightFinding> findings, object? user_sight);
public record SightCounts(int bad, int warn, int info);
