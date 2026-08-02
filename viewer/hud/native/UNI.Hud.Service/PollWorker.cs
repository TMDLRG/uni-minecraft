// PollWorker.cs — BackgroundService that polls the upstream truth surfaces
// every 3s, updates rings, gathers sight, and emits EventLog entries on
// edges (upstream up<->down transitions, new sight findings).

using System.Net;
using System.Net.Http;
using System.Text.Json;

namespace UNI.Hud.Service;

public sealed class PollWorker : BackgroundService
{
    private readonly HudState _state;
    private readonly EventLogger _log;
    private readonly ILogger<PollWorker> _logger;
    private static readonly HttpClient _http = new(new SocketsHttpHandler {
        PooledConnectionLifetime = TimeSpan.FromSeconds(10),
        MaxConnectionsPerServer = 4,
    }) { Timeout = TimeSpan.FromSeconds(8) };
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(3);

    // The FAST loop (3s) — the broadcast-critical surfaces.
    private static readonly (string Name, string Url, int TimeoutMs)[] Upstreams =
    {
        ("mission",      "http://127.0.0.1:8090/api/mission",      3000),
        ("door_state",   "http://127.0.0.1:8090/api/door/state",   2500),
        ("door_journey", "http://127.0.0.1:8090/api/door/journey", 2500),
        ("console",      "http://127.0.0.1:8098/api/health",       2500),
        // NUMERIC egress readers, straight from the MediaMTX API. The console's health board only
        // exposes this as prose ("program readers: 2") and only while streaming; parsing that
        // string would be the same defect as the retired air regex. Read the number at its source.
        ("mediamtx",     "http://127.0.0.1:9997/v3/paths/list",    2500),
        // NOTE: `gaia_drift` USED TO LIVE HERE, and it was a self-inflicted disaster ------------
        // Every seat route (incl. /api/gaia/drift) computes Gaia's FULL envelope internally before
        // filtering (gaia_server.cjs:150 projectSeat) — a measured ~20s / 611KB job. It sat in this
        // 3s fast loop behind an 8s HttpClient timeout, so:
        //   (a) it TIMED OUT ON EVERY SINGLE POLL since the day it was added — measured on the
        //       deployed service: up=null err=timeout, latency ring a solid [8015,8000,8000,...],
        //       drift rows 0. The HUD never once had Gaia data, and never said so; and
        //   (b) Task.WhenAll below waits for ALL upstreams, so that doomed 8s timeout stretched the
        //       "3s" loop to a MEASURED 11.1s (237 polls in 2620s of uptime) — the whole glance
        //       surface was ~11s stale while advertising poll_interval_ms:3000.
        // Gaia now runs on its own slow loop with a timeout that can actually succeed. The fast
        // loop is broadcast-critical and must never again block on a 20s introspection call.
    };

    // The SLOW loop — Gaia's full envelope is a MEASURED ~20s / 611KB computation (not the ~3s the
    // design assumed). 120s cadence: her content (repo, gates, science, infra, drift) moves slowly,
    // and the broadcast-critical liveness the operator watches at 3s comes from mission/console.
    // Timeout 40s sits deliberately UNDER gaia_server's own 45s ENVELOPE_TIMEOUT_MS ceiling, so a
    // real server-side 504 reaches us as a 504 rather than being masked by a client-side abort.
    private static readonly TimeSpan GaiaFullInterval = TimeSpan.FromSeconds(120);
    private const string GaiaFullUrl = "http://127.0.0.1:8096/api/gaia";
    private static readonly HttpClient _httpSlow = new(new SocketsHttpHandler {
        PooledConnectionLifetime = TimeSpan.FromSeconds(30),
        MaxConnectionsPerServer = 1,
    }) { Timeout = TimeSpan.FromSeconds(40) };
    private DateTime _lastGaiaFull = DateTime.MinValue;
    private volatile bool _gaiaInFlight;   // guards against stacking Gaia calls (see PollOnce)

    // Rate-computation backing fields (a property cannot be passed by ref).
    private long? _stateLastColonyFrame; private DateTime? _stateLastColonyAt;
    private long? _stateLastFrames;      private DateTime? _stateLastFramesAt;
    // Measured cadence — so the snapshot reports the loop's REAL period instead of the nominal
    // constant it used to assert (which was wrong by 3.7x and nobody could see it).
    private DateTime? _lastLoopAt; private double? _measuredIntervalMs;

    public PollWorker(HudState state, EventLogger log, ILogger<PollWorker> logger)
    { _state = state; _log = log; _logger = logger; }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _state.GitCommit = TryReadGitCommit();
        _state.ModuleVersionId = BuildIdentity.ModuleVersionId;
        _log.Info(EventLogger.EvtServiceStart,
            $"UNI-HUD service started: 127.0.0.1:8100 (poll {PollInterval.TotalSeconds}s, repo={Gates.ResolveRepoRoot()}) commit={_state.GitCommit ?? "unknown"} mvid={_state.ModuleVersionId} pid={Environment.ProcessId}");

        while (!stoppingToken.IsCancellationRequested)
        {
            var started = Environment.TickCount64;
            try { await PollOnce(stoppingToken); }
            catch (Exception e) { _logger.LogError(e, "poll failed"); }
            // Sleep the REMAINDER of the interval, not a fixed 3s on top of however long the work
            // took. The old fixed delay made the true period `work + 3s` — with mission alone costing
            // ~1.8s, a "3s" HUD actually refreshed every ~4.8s and nothing said so. Deficit-sleeping
            // makes the loop honor the interval it advertises; a floor of 250ms keeps a pathological
            // upstream from spinning this into a hot loop.
            var elapsed = Environment.TickCount64 - started;
            var remaining = (int)(PollInterval.TotalMilliseconds - elapsed);
            try { await Task.Delay(Math.Max(250, remaining), stoppingToken); }
            catch (TaskCanceledException) { break; }
        }
        _log.Info(EventLogger.EvtServiceStop, "UNI-HUD service stopped");
    }

    private async Task PollOnce(CancellationToken ct)
    {
        var results = new Dictionary<string, UpstreamResult>();
        var tasks = Upstreams.Select(async u => (u.Name, await ProbeAsync(u.Name, u.Url, u.TimeoutMs, ct)));
        foreach (var (name, res) in await Task.WhenAll(tasks)) results[name] = res;

        // Emit EventLog on edges (up<->down)
        foreach (var (name, res) in results)
        {
            _state.LastUpByUpstream.TryGetValue(name, out var prev);
            var nowUp = res.Up == true;
            if (prev.HasValue && prev.Value != nowUp)
            {
                if (nowUp) _log.Info(EventLogger.EvtUpstreamRecovered, $"upstream '{name}' UP: HTTP {res.Status} in {res.LatencyMs}ms");
                else _log.Warn(EventLogger.EvtUpstreamDegraded, $"upstream '{name}' DOWN: {res.Err ?? $"HTTP {res.Status}"}");
            }
            _state.LastUpByUpstream[name] = nowUp;
        }

        _state.LastUpstreams = results;
        var loopNow = DateTime.UtcNow;
        // Measure the loop's REAL period. The snapshot used to hardcode poll_interval_ms:3000 while
        // actually running at 11.1s (dragged by the doomed Gaia call) — an unfalsifiable constant
        // presented as a fact. Report what we MEASURE; an EWMA so one slow cycle doesn't spike it.
        if (_lastLoopAt.HasValue)
        {
            var dt = (loopNow - _lastLoopAt.Value).TotalMilliseconds;
            _measuredIntervalMs = _measuredIntervalMs.HasValue ? _measuredIntervalMs.Value * 0.8 + dt * 0.2 : dt;
            _state.MeasuredIntervalMs = _measuredIntervalMs;
        }
        _lastLoopAt = loopNow;
        _state.LastPollAt = loopNow;
        _state.PollCount++;

        // Extract sparkline metrics from probe results (source-verbatim, no aggregate)
        var mission = results.GetValueOrDefault("mission");
        var missionBody = mission?.Body as JsonElement?;
        var stack = TryStr(missionBody, "stack");
        var stackN = stack == "UP" ? 2 : stack == "PARTIAL" ? 1 : 0;
        _state.StackRing.Push(stackN);
        // Internal diagnostics only — NOT drawn on the glance surface. These measure the HUD's own
        // HTTP round-trip; the operator learns nothing about the broadcast from them.
        _state.LauncherLatRing.Push(mission?.LatencyMs);
        // GaiaLatRing is pushed by PollGaiaFull on the SLOW loop now. Pushing it here too would
        // stamp a null every 3s (the gaia_drift upstream no longer exists) and bury the real
        // measurement under ~40 nulls between slow polls.
        _state.AudienceCountRing.Push(_state.Audience.Size);

        var now2 = DateTime.UtcNow;

        // ---- COLONY frame-advance rate (frames/sec) -------------------------------------------
        // THE honest "the colony is thinking" line — the same monotonically-advancing counter that
        // show.ex:89's anti-frozen guard trusts. A flat zero here means the colony is FROZEN even
        // while every process is happily "up"; that is precisely what a mixer board must show and
        // what the retired binary producer_up (always 1) structurally could not.
        JsonElement? colonyEl = missionBody.HasValue && missionBody.Value.TryGetProperty("colony", out var ce) &&
                                ce.ValueKind == JsonValueKind.Object ? ce : null;
        var frame = colonyEl.HasValue ? SnapshotBuilder.TryLong(colonyEl.Value, "frame") : null;
        _state.ColonyFrameRateRing.Push(Rate(frame, ref _stateLastColonyFrame, ref _stateLastColonyAt, now2));
        _state.LastColonyFrame = _stateLastColonyFrame;
        _state.LastColonyFrameAt = _stateLastColonyAt;
        // gate `colony-frozen-needs-dwell-not-one-sample`: stamp when the counter ACTUALLY moved.
        // The instantaneous rate above is aliasing-prone (sample interval == event interval), so it
        // may not be used to assert FROZEN. This stamp can: it is wall-clock against an observed
        // change, immune to the tick rate. Unmeasured (null frame) must NOT count as a change and
        // must NOT count as stalled — it is simply unknown, and the field stays null.
        if (frame.HasValue)
        {
            if (!_state.LastChangedColonyFrameValue.HasValue || frame.Value != _state.LastChangedColonyFrameValue.Value)
            {
                _state.LastChangedColonyFrameValue = frame.Value;
                _state.ColonyFrameLastChangedAt = now2;
            }
        }

        // tps: the world's own tick rate (20.0 nominal). Real magnitude, real floor.
        double? tps = null;
        if (colonyEl.HasValue && colonyEl.Value.TryGetProperty("tps", out var tpsObj) && tpsObj.ValueKind == JsonValueKind.Object)
            tps = SnapshotBuilder.TryDouble(tpsObj, "tps");
        _state.TpsRing.Push(tps);

        // ---- ENCODER rates ---------------------------------------------------------------------
        // Only trust air numbers when air is NOT stale — a stale air block carries the console's
        // fabricated {level:"OFF"} placeholder whose frames/congestion are zeros that never
        // happened. Charting those would draw a confident flat line out of a non-measurement.
        var airStale = missionBody.HasValue && missionBody.Value.TryGetProperty("airStale", out var asEl) &&
                       asEl.ValueKind == JsonValueKind.True;
        JsonElement? airEl = (!airStale && missionBody.HasValue && missionBody.Value.TryGetProperty("air", out var ae) &&
                              ae.ValueKind == JsonValueKind.Object) ? ae : null;
        var frames = airEl.HasValue ? SnapshotBuilder.TryLong(airEl.Value, "frames") : null;
        _state.OutputFpsRing.Push(Rate(frames, ref _stateLastFrames, ref _stateLastFramesAt, now2));
        _state.LastOutputFrames = _stateLastFrames;
        _state.LastOutputFramesAt = _stateLastFramesAt;
        _state.CongestionRing.Push(airEl.HasValue ? SnapshotBuilder.TryDouble(airEl.Value, "congestion") : null);
        var skipped = airEl.HasValue ? SnapshotBuilder.TryLong(airEl.Value, "skipped") : null;
        _state.DroppedPctRing.Push(frames.HasValue && frames.Value > 0 && skipped.HasValue
            ? (double)skipped.Value / frames.Value * 100.0 : null);

        // ---- EGRESS readers (numeric) ----------------------------------------------------------
        // armed is irrelevant here — this call only extracts `readers` to push to the ring for the
        // sparkline. The floor is applied at render time (SnapshotBuilder.Build passes the real armed).
        var egress = SnapshotBuilder.BuildEgress(results.GetValueOrDefault("mediamtx"), 0);
        _state.EgressReadersRing.Push(egress.GetType().GetProperty("readers")?.GetValue(egress) as long?);

        // ---- Gaia full envelope on its own slow cadence -----------------------------------------
        // FIRE-AND-FORGET, NEVER awaited here. Giving Gaia its own INTERVAL is not enough: awaiting
        // her ~20s call inside this loop still stalls the broadcast-critical fast loop every time it
        // fires — which is the very defect this refactor set out to kill, just once every 120s
        // instead of every 3s. (Measured on the first deploy of this change: the fast loop's period
        // jumped to 18.5s the moment the first Gaia poll landed inside it. Caught only because the
        // snapshot now publishes its MEASURED period — the whole point of that field.)
        // The _gaiaInFlight guard means a Gaia call that outlives its own interval can never stack
        // up a second one behind it.
        if (!_gaiaInFlight && (now2 - _lastGaiaFull) >= GaiaFullInterval)
        {
            _lastGaiaFull = now2;
            _gaiaInFlight = true;
            _ = Task.Run(async () =>
            {
                try { await PollGaiaFull(ct); }
                catch (Exception e) { _state.GaiaErr = e.Message; }
                finally { _gaiaInFlight = false; }
            }, ct);
        }

        // Refresh gate ledger cache
        var (rows, err) = Gates.Read();
        _state.GatesCache = rows;
        _state.GatesOk = err == null;
        _state.GatesErr = err;

        // Gather sight
        var snap = SnapshotBuilder.Build(_state);
        var svcSight = Enlightened.Gather(snap, _state);
        var userFresh = _state.UserSightLastPushAt.HasValue &&
                        (DateTime.UtcNow - _state.UserSightLastPushAt.Value).TotalSeconds < 90;
        var userFindings = userFresh ? _state.UserSightFindings : new List<SightFinding>();
        var now = DateTime.UtcNow;
        var mergedList = svcSight.findings.Concat(userFindings).ToList();
        // stamp since_ms for user findings via the same sinceMap
        foreach (var f in userFindings)
        {
            if (!_state.SightSince.ContainsKey(f.code)) _state.SightSince[f.code] = now;
            // Rewrite since_ms — records are immutable, so replace the entry
        }
        // Compose merged envelope
        var merged = mergedList.Select(f => f).ToList();
        var counts = new SightCounts(
            bad: merged.Count(f => f.severity == "bad"),
            warn: merged.Count(f => f.severity == "warn"),
            info: merged.Count(f => f.severity == "info"));
        var envelope = new SightEnvelope(
            updated_at: DateTime.UtcNow.ToString("O"),
            total: merged.Count, counts: counts, findings: merged,
            user_sight: new {
                fresh = userFresh,
                last_push_at = _state.UserSightLastPushAt,
                last_push_from = _state.UserSightLastPushFrom,
                count = userFindings.Count,
            });
        _state.LastSight = envelope;
        // EventLog new findings
        var currentCodes = merged.Select(f => f.code).ToHashSet();
        foreach (var f in merged)
        {
            if (_state.LastSightCodes.Contains(f.code)) continue;
            if (f.severity == "bad") _log.Error(EventLogger.EvtSightBad, $"sight BAD [{f.code}]: {f.title}");
            else if (f.severity == "warn") _log.Warn(EventLogger.EvtSightWarn, $"sight WARN [{f.code}]: {f.title}");
        }
        _state.LastSightCodes = currentCodes;
    }

    // Δcounter/Δt in units/sec. Returns NULL (a real "not measured"), never 0, when a rate cannot
    // honestly be computed: no prior sample, no current value, or a counter that went BACKWARDS
    // (the upstream restarted — the delta across that boundary is meaningless, not zero).
    // A fabricated 0 here would draw a confident "the colony is frozen" line out of a non-reading.
    internal static double? Rate(long? current, ref long? last, ref DateTime? lastAt, DateTime now)
    {
        if (!current.HasValue) { last = null; lastAt = null; return null; }
        var prev = last; var prevAt = lastAt;
        last = current; lastAt = now;
        if (!prev.HasValue || !prevAt.HasValue) return null;      // first sample: unknowable
        if (current.Value < prev.Value) return null;              // counter reset: unknowable
        var dt = (now - prevAt.Value).TotalSeconds;
        if (dt <= 0.001) return null;
        return (current.Value - prev.Value) / dt;
    }

    // Gaia's full envelope -> per-seat rollup + drift verdicts. Counting seats CLIENT-side is
    // deliberate: GAIA LAW forbids Gaia from computing rollups about herself, but a downstream
    // consumer may count what she projects verbatim. Seats are derived ENTIRELY from the data —
    // no hardcoded seat list. (The design assumed 10 seats incl. `relay`; the live envelope has 9
    // and no `relay` seat exists at all. A hardcoded list would have invented a seat.)
    private async Task PollGaiaFull(CancellationToken ct)
    {
        var t0 = Environment.TickCount64;
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, GaiaFullUrl);
            req.Headers.Add("Accept", "application/json");
            using var resp = await _httpSlow.SendAsync(req, HttpCompletionOption.ResponseContentRead, ct);
            var raw = await resp.Content.ReadAsStringAsync(ct);
            _state.GaiaLatRing.Push((int)(Environment.TickCount64 - t0));
            if (!resp.IsSuccessStatusCode) { _state.GaiaErr = $"http {(int)resp.StatusCode}"; return; }

            var body = JsonSerializer.Deserialize<JsonElement>(raw);
            if (!body.TryGetProperty("result", out var result) ||
                !result.TryGetProperty("signals", out var signals) || signals.ValueKind != JsonValueKind.Array)
            { _state.GaiaErr = "envelope has no result.signals"; return; }

            var bySeat = new Dictionary<string, (int n, int up, int down, int unknown)>();
            var drift = new List<DriftRow>();
            foreach (var s in signals.EnumerateArray())
            {
                var seat = TryStr(s, "seat") ?? "(unseated)";
                var agg = bySeat.GetValueOrDefault(seat);
                agg.n++;
                // Only tcp/http signals carry a live probe. A signal with no live.up is UNKNOWN —
                // it is NOT evidence of health, and must never be counted as up.
                if (s.TryGetProperty("live", out var live) && live.ValueKind == JsonValueKind.Object &&
                    live.TryGetProperty("up", out var upEl))
                {
                    if (upEl.ValueKind == JsonValueKind.True) agg.up++;
                    else if (upEl.ValueKind == JsonValueKind.False) agg.down++;
                    else agg.unknown++;
                }
                else agg.unknown++;
                bySeat[seat] = agg;

                if (TryStr(s, "kind") == "drift")
                {
                    var (equal, _) = SnapshotBuilder.ParseDriftRaw(s);
                    drift.Add(new DriftRow(TryStr(s, "id") ?? "(unnamed)", equal));
                }
            }

            _state.GaiaSeats = bySeat.OrderBy(kv => kv.Key)
                .Select(kv => new GaiaSeat(kv.Key, kv.Value.n, kv.Value.up, kv.Value.down, kv.Value.unknown)).ToList();
            _state.GaiaDrift = drift;
            _state.GaiaPolledAt = DateTime.UtcNow;
            _state.GaiaErr = null;
        }
        catch (Exception e)
        {
            _state.GaiaLatRing.Push((int)(Environment.TickCount64 - t0));
            // Keep the LAST GOOD seats but record the error + let polled_at age visibly, so the UI
            // can show "stale, last good Xs ago" rather than silently presenting old data as fresh.
            _state.GaiaErr = e is OperationCanceledException ? "timeout" : e.Message;
        }
    }

    private static async Task<UpstreamResult> ProbeAsync(string name, string url, int timeoutMs, CancellationToken ct)
    {
        var t0 = Environment.TickCount64;
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromMilliseconds(timeoutMs));
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Headers.Add("Accept", "application/json");
            req.Headers.ConnectionClose = true;
            using var resp = await _http.SendAsync(req, HttpCompletionOption.ResponseContentRead, cts.Token);
            var lat = (int)(Environment.TickCount64 - t0);
            var raw = await resp.Content.ReadAsStringAsync(cts.Token);
            if (!resp.IsSuccessStatusCode)
                return new UpstreamResult(name, false, (int)resp.StatusCode, lat, $"http {(int)resp.StatusCode}", url, null);
            try
            {
                var body = JsonSerializer.Deserialize<JsonElement>(raw);
                return new UpstreamResult(name, true, (int)resp.StatusCode, lat, null, url, body);
            }
            catch (Exception je)
            {
                return new UpstreamResult(name, false, (int)resp.StatusCode, lat, $"bad-json: {je.Message}", url, null);
            }
        }
        catch (OperationCanceledException)
        {
            return new UpstreamResult(name, null, 0, (int)(Environment.TickCount64 - t0), "timeout", url, null);
        }
        catch (Exception e)
        {
            return new UpstreamResult(name, null, 0, (int)(Environment.TickCount64 - t0), e.Message, url, null);
        }
    }

    private static string? TryReadGitCommit()
    {
        try
        {
            var psi = new System.Diagnostics.ProcessStartInfo("git", "rev-parse HEAD")
            {
                WorkingDirectory = Gates.ResolveRepoRoot(),
                RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true,
            };
            using var p = System.Diagnostics.Process.Start(psi);
            if (p == null) return null;
            var s = p.StandardOutput.ReadToEnd().Trim();
            p.WaitForExit(1500);
            return string.IsNullOrEmpty(s) ? null : s[..Math.Min(40, s.Length)];
        }
        catch { return null; }
    }

    internal static string? TryStr(JsonElement? el, string key)
    {
        if (!el.HasValue || el.Value.ValueKind != JsonValueKind.Object) return null;
        if (!el.Value.TryGetProperty(key, out var v)) return null;
        return v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    }

    internal static JsonElement? TryFindTile(JsonElement? mission, string key)
    {
        if (!mission.HasValue || mission.Value.ValueKind != JsonValueKind.Object) return null;
        if (!mission.Value.TryGetProperty("tiles", out var tiles) || tiles.ValueKind != JsonValueKind.Array) return null;
        foreach (var t in tiles.EnumerateArray())
            if (t.TryGetProperty("key", out var k) && k.ValueKind == JsonValueKind.String && k.GetString() == key) return t;
        return null;
    }
}
