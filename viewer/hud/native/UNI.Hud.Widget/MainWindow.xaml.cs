// MainWindow.xaml.cs — the actual widget behaviour.
// - Docks to screen edge (Right by default)
// - Polls http://127.0.0.1:8100/api/hud/snapshot every 3s (matches shared bus)
// - Tray icon (WinForms NotifyIcon), Ctrl+Shift+H global hotkey
// - Renders: air strip, 13 door tiles, sparklines, gate ladder, sight, audience

using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;
using WF = System.Windows.Forms;
using Application = System.Windows.Application;
using Color = System.Windows.Media.Color;
using Colors = System.Windows.Media.Colors;
using Brush = System.Windows.Media.Brush;
using SolidColorBrush = System.Windows.Media.SolidColorBrush;
using FontFamily = System.Windows.Media.FontFamily;
using Point = System.Windows.Point;
using HorizontalAlignment = System.Windows.HorizontalAlignment;
using VerticalAlignment = System.Windows.VerticalAlignment;

namespace UNI.Hud.Widget;

public partial class MainWindow : Window
{
    private readonly HudClient _client = new();
    // Talks DIRECTLY to the command center (:8098), not the :8100 service — a deliberate separation
    // (2026-07-16): actuation (arm/disarm) is the operator's own click on their own box, never
    // proxied through the read-only :8100 service surface. "Reads never actuate" stays true for :8100.
    private static readonly HttpClient _cc = new(new SocketsHttpHandler { PooledConnectionLifetime = TimeSpan.FromSeconds(10) }) { Timeout = TimeSpan.FromSeconds(6) };
    private const string CcBase = "http://127.0.0.1:8098";
    private bool _armBusy = false;
    private readonly DispatcherTimer _timer;
    private readonly DispatcherTimer _clockTimer;
    private WF.NotifyIcon? _tray;
    private HotKey? _hotkey;
    private DockEdge _dock = DockEdge.Right;

    // THE ONE CHANGE (gate air-alarm-annunciates, 2026-07-17): the off-monitor air alarm. The DECISION
    // is the unit-tested AlarmEngine; this window owns the ANNUNCIATION (banner + sound + taskbar flash
    // + tray balloon). Session-0 isolation forbids the service from doing any of this in the operator's
    // session, so it lives here, in the widget.
    private readonly AlarmEngine _alarm = new();
    private AlarmDecision? _lastAlarm;
    private readonly HashSet<AlarmCode> _annunciated = new();  // codes already flashed/ballooned this episode

    [StructLayout(LayoutKind.Sequential)]
    private struct FLASHWINFO { public uint cbSize; public IntPtr hwnd; public uint dwFlags; public uint uCount; public uint dwTimeout; }
    [DllImport("user32.dll")] private static extern bool FlashWindowEx(ref FLASHWINFO pwfi);
    private const uint FLASHW_ALL = 3, FLASHW_TIMERNOFG = 12;

    // JITTER FIX (2026-07-16): the old surface torn down + rebuilt 5 whole StackPanels every 3s
    // (doors, gates, gaia seats, drift, health), even when the underlying data was identical —
    // forcing a full measure+arrange pass on the entire scroll body and driving a 1-2px shift on
    // labels the moment ClearType re-positioned them. Cache each section's data hash; if it hasn't
    // changed, skip the tear-down (visibly still, no jitter, less CPU).
    // 2026-07-17: the section jitter-cache is now the testable SectionCache (RenderDecisions.cs) so
    // the recovery-repaint behaviour (gate hud-recovery-repaints) can be rehearsed without WPF.
    private readonly SectionCache _sections = new();
    private bool ChangedSince(string section, string data) => _sections.ShouldRepaint(section, data);

    public enum DockEdge { Right, Left, Top, Bottom, Float }

    public MainWindow()
    {
        InitializeComponent();
        _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };
        // DEFENSE IN DEPTH (2026-07-17): an exception in this `async void` tick crashes the ENTIRE
        // widget (a JSON-null GetInt64 did exactly that under the alarm proof). The glance surface —
        // the thing that exists to tell the operator when something is wrong — must never be the thing
        // that dies. Swallow-and-log any per-tick fault; the next tick retries. (The root cause is
        // still fixed at source via NumL/NumI; this is the backstop, not the fix.)
        _timer.Tick += async (_, _) => { try { await Refresh(); } catch (Exception ex) { System.Diagnostics.Debug.WriteLine("HUD tick fault: " + ex); } };
        // JITTER FIX (2026-07-16): was HH:mm:ss on a 1s tick — the seconds digit changing every
        // second, combined with the 3s full-refresh, made the whole surface feel like it was
        // refreshing 2x/sec (operator's own words: "it seems to refresh every 0.5 second and the
        // text jumps slightly"). HH:mm at 30s is appropriate for a glance surface; there is no
        // operator information in the seconds counter.
        _clockTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
        _clockTimer.Tick += (_, _) => ClockText.Text = DateTime.Now.ToString("HH:mm");
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        DockTo(DockEdge.Right);
        SetupTray();
        SetupHotkey();
        ClockText.Text = DateTime.Now.ToString("HH:mm");   // paint immediately, don't wait 30s
        _timer.Start();
        _clockTimer.Start();
        await Refresh();
    }

    // ---- rendering ---------------------------------------------------------
    private async Task Refresh()
    {
        var env = await _client.GetAsync("/api/hud/snapshot");
        if (env == null || env.Value.ValueKind != JsonValueKind.Object)
        {
            AirBadge.Text = "SERVICE DOWN";
            AirBadge.Foreground = (Brush)FindResource("Bad");
            StackLine.Text = "no response from :8100";
            ProvText.Text = "source: /api/hud/snapshot UNREACHABLE";
            // The snapshot GET failed entirely — if we were on the air, this is a BLIND alarm, not a
            // reason to stand down (the latch never disarms on lost sight).
            RenderAlarm(null, blind: true);
            return;
        }
        if (!env.Value.TryGetProperty("result", out var r)) return;

        // Stack
        var stack = TryPath(r, "stack.state");
        StackLine.Text = $"STACK: {stack ?? "—"}";

        RenderAir(r);
        RenderMixer(r);

        // Journey
        var jId = TryPath(r, "journey_current_step.id");
        var jLabel = TryPath(r, "journey_current_step.label");
        JourneyLine.Text = jId != null ? $"journey: {jId} — {jLabel ?? ""}" : "journey: —";

        RenderDoors(r);
        RenderGaia(r);
        RenderHealth(r);
        RenderGates(r);

        // Sight
        var sightTotal = NumI(TryPath2(r, "sight.total")) ?? 0;
        var sBad = NumI(TryPath2(r, "sight.counts.bad")) ?? 0;
        var sWarn = NumI(TryPath2(r, "sight.counts.warn")) ?? 0;
        var sInfo = NumI(TryPath2(r, "sight.counts.info")) ?? 0;
        // 2026-07-17 (gate hud-sight-shows-blind): "0 findings · resonant" got GREENER as the sensor
        // died. The user-mode detector (hud_user_sight.ps1) has been dead since 2026-07-14 and is
        // launched by nothing, so its findings simply drop out and the total falls toward zero — the
        // surface reads calmer precisely because a whole leg went blind. The service ships
        // sight.user_sight.fresh; render it. A dead sensor is NOT "resonant" — it is NOT REPORTING.
        // (We do NOT synthesize a `bad` finding for never-reported; the helper is unwired, that would
        // fire red forever. This states the blindness without inventing an alarm.)
        // 2026-07-17 (gate hud-renderer-honesty): the blind-sensor decision is the pure, testable
        // RenderDecisions.SightHeader — a blind user-sight sensor reads "NOT REPORTING" in Warn, never
        // a greener "resonant" as the dead helper's findings drop out.
        var userSightFresh = TryPath2(r, "sight.user_sight.fresh") is JsonElement usf && usf.ValueKind == JsonValueKind.True;
        var (sightText, sightBrush) = RenderDecisions.SightHeader(sightTotal, sBad, sWarn, sInfo, userSightFresh);
        SightHeader.Text = sightText;
        SightHeader.Foreground = (Brush)FindResource(sightBrush);
        RenderSight(r);

        // Audience (fetch separately)
        await RenderAudience();

        // Fan-out arm/disarm status (direct to command center, :8098)
        await RefreshArmStatus();

        // Provenance — including the loop's MEASURED period next to its nominal one. The deployed
        // service advertised poll_interval_ms:3000 while really running at 11.1s (a doomed 20s Gaia
        // call sat in the 3s loop); publishing both makes any future drag visible instead of hidden.
        var commit = TryPath(env.Value, "envelope.git_commit");
        var pollCount = NumL(TryPath2(r, "hud.poll_count"));
        // 2026-07-17 (gate hud-freshness-honest): the footer used to show the measured CADENCE, which
        // deficit-sleeps to a reassuring ~3.0s and FREEZES there if the loop hangs (a cadence sits
        // still; it never tells you the loop stopped). REPLACED — not appended, so the line still fits
        // the 600px dock — with the AGE since the last poll, which counts UP when the snapshot is
        // frozen. The service stamps it at request time. Stale => Warn + explicit words.
        var ageMs = NumL(TryPath2(r, "hud.last_poll_age_ms"));
        var stale = TryPath2(r, "hud.stale") is JsonElement stEl && stEl.ValueKind == JsonValueKind.True;
        var ageStr = ageMs.HasValue ? $"{ageMs.Value / 1000}s ago" : "?";
        ProvText.Text = stale
            ? $"source: /api/hud/snapshot · commit {(commit == null ? "?" : commit.Substring(0, Math.Min(7, commit.Length)))} · ⚠ STALE — last poll {ageStr}"
            : $"source: /api/hud/snapshot · commit {(commit == null ? "?" : commit.Substring(0, Math.Min(7, commit.Length)))} · poll {pollCount} · last {ageStr}";
        ProvText.Foreground = (Brush)FindResource(stale ? "Warn" : "Mute");

        // THE AIR ALARM — fed from the measured snapshot every tick. Silent unless we are measurably
        // on the air AND something the operator would need to run to went dark.
        RenderAlarm(r, blind: false);
    }

    // ---- AIR: the one place air is rendered. NEVER fabricates OFF. ----------------------------
    // Was: a regex over studio_ports.console.detail scraping `air=(\w+)`, defaulting to "OFF" on no
    // match — so an absent console tile, or a reworded detail string, silently read "OFF AIR" while
    // the show could be live. Now straight off the service's first-class, staleness-qualified air.
    private void RenderAir(JsonElement r)
    {
        var level = TryPath(r, "air.level") ?? "UNKNOWN";
        var stale = TryPath2(r, "air.stale") is JsonElement s && s.ValueKind == JsonValueKind.True;
        var program = TryPath(r, "air.program");

        // 2026-07-17: the badge text+colour decision now lives in the pure, testable
        // RenderDecisions.AirBadge (gate hud-renderer-honesty). It encodes the blocker-#1 honesty:
        // STREAMING_DARK (a LIVE black push) => Bad/red, NEVER the reassuring green the old "STREAMING"
        // level used; stale/UNKNOWN => SYNCING (never a fabricated OFF).
        var (badgeText, badgeBrush) = RenderDecisions.AirBadge(level, stale);
        AirBadge.Text = badgeText;
        AirBadge.Foreground = (Brush)FindResource(badgeBrush);
        if (badgeText == "SYNCING")
        {
            AirDetail.Text = TryPath(r, "air.source") ?? "air not measured — this is NOT 'off air'";
            return;
        }
        var tc = TryPath(r, "air.timecode");
        // The console ships pictureNote already fenced ("source-enablement, NOT a pixel
        // measurement"). Carry it VERBATIM — never re-word a measured claim into a stronger one.
        var pnote = TryPath(r, "air.pictureNote");
        AirDetail.Text = $"program: {program ?? "—"}" + (string.IsNullOrEmpty(tc) ? "" : $" · {tc}");
        if (level == "STREAMING_DARK" && !string.IsNullOrEmpty(pnote)) AirDetail.Text += $"\n{pnote}";
    }

    // ---- MIXER STRIP -------------------------------------------------------------------------
    private void RenderMixer(JsonElement r)
    {
        // EGRESS — readers. null means NOT MEASURED and must never render as a confident 0.
        var readersEl = TryPath2(r, "egress.readers");
        var readers = readersEl.HasValue && readersEl.Value.ValueKind == JsonValueKind.Number
            ? readersEl.Value.GetInt64() : (long?)null;
        var ready = TryPath2(r, "egress.ready") is JsonElement rd && rd.ValueKind == JsonValueKind.True;
        // 2026-07-17 (gate egress-armed-floor-always-on): the colour decision is now the pure,
        // testable RenderDecisions.EgressColour — green ONLY if readers >= max(1, armed), amber for a
        // partial (some but not all armed delivering), grey Nv for not-measured. `armed` is forwarded
        // from the console via launcher /api/mission (absent => 0 => floor 1, no regression).
        var armedEl = TryPath2(r, "egress.armed");
        var armed = armedEl.HasValue && armedEl.Value.ValueKind == JsonValueKind.Number ? armedEl.Value.GetInt64() : 0;
        var (egBrush, _) = RenderDecisions.EgressColour(readers, armed);
        var want = Math.Max(1, armed);
        if (!readers.HasValue)
        {
            EgressValue.Text = "—";
            EgressValue.Foreground = (Brush)FindResource(egBrush);
            EgressNote.Text = TryPath(r, "egress.source") ?? "not measured";
        }
        else
        {
            EgressValue.Text = readers.Value.ToString() + (armed > 0 ? $"/{armed}" : "");
            EgressValue.Foreground = (Brush)FindResource(egBrush);
            EgressNote.Text = readers.Value >= want
                ? (armed > 0 ? $"{readers.Value}/{armed} armed pusher(s) pulling program" : $"{readers.Value} reader(s) pulling program") + (ready ? "" : " (path NOT ready)")
                : readers.Value >= 1 && armed > 1 ? $"only {readers.Value} of {armed} armed — a platform is NOT receiving"
                : ready ? "ingesting, but NOBODY is pulling it" : "no publish into uni yet";
        }
        DrawSparkline(EgressSpark, ExtractDoubleArray(TryPath2(r, "metrics.egress_readers")),
                      Color.FromRgb(46, 204, 113), 0, null);

        // 2026-07-17 (gate hud-freshness-honest): LastOf() scanned ~120 slots (~6 min) back for the
        // last non-null and returned NO age, so when air went stale a null was pushed each poll and a
        // 6-minute-old fps/congestion still rendered as a confident green number. LastOfAged returns
        // how many slots back the value is; past ~2 measured intervals we GREY it and say when it was
        // last real. `stale`/`_slotAgeMs` come from the snapshot's own request-time freshness.
        double measIntervalMs = TryPath2(r, "hud.poll_interval_measured_ms") is JsonElement mi && mi.ValueKind == JsonValueKind.Number ? mi.GetDouble() : 3000.0;
        long SlotAgeMs(int back) => (long)Math.Round(back * measIntervalMs);
        string AgoNote(int back) => back <= 1 ? "" : $" · last measured {SlotAgeMs(back) / 1000}s ago";

        // ENCODER — fps from Δair.frames/Δt.
        var fps = ExtractDoubleArray(TryPath2(r, "metrics.output_fps"));
        var (lastFps, fpsBack) = LastOfAged(fps);
        bool fpsStale = RenderDecisions.MetricFreshness(lastFps.HasValue, fpsBack) == RenderDecisions.Freshness.Stale;
        FpsValue.Text = lastFps.HasValue ? $"{lastFps.Value:F1}" : "—";
        FpsValue.Foreground = (Brush)FindResource(!lastFps.HasValue ? "Nv" : fpsStale ? "Nv" : lastFps.Value >= 25 ? "Ok" : lastFps.Value > 0 ? "Warn" : "Mute");
        var framesEl = TryPath2(r, "air.frames");
        var frames = framesEl.HasValue && framesEl.Value.ValueKind == JsonValueKind.Number ? framesEl.Value.GetInt64() : (long?)null;
        EncoderNote.Text = !lastFps.HasValue
            ? "not measured (encoder idle or air unknown)"
            : $"{frames?.ToString() ?? "?"} frames total" + AgoNote(fpsBack);
        DrawSparkline(FpsSpark, fps, Color.FromRgb(63, 210, 255), 0, null);

        var cong = ExtractDoubleArray(TryPath2(r, "metrics.congestion"));
        var drop = ExtractDoubleArray(TryPath2(r, "metrics.dropped_pct"));
        var (lastCong, congBack) = LastOfAged(cong); var (lastDrop, _) = LastOfAged(drop);
        bool congStale = RenderDecisions.MetricFreshness(lastCong.HasValue, congBack) == RenderDecisions.Freshness.Stale;
        CongestionValue.Text = lastCong.HasValue
            ? $"{lastCong.Value:F2} · {(lastDrop.HasValue ? lastDrop.Value.ToString("F2") + "%" : "—")}"
            : "—";
        CongestionValue.Foreground = (Brush)FindResource(!lastCong.HasValue ? "Nv" : congStale ? "Nv" : lastCong.Value >= 0.2 ? "Bad" : lastCong.Value > 0 ? "Warn" : "Ok");
        DrawSparkline(CongestionSpark, cong, Color.FromRgb(241, 180, 15), 0, 1);

        // COLONY — THE liveness line. The IDEA is right (a flat counter means the mind is frozen
        // even while every process reports "up"), but the MEASUREMENT was wrong, and the live
        // surface convicted it on 2026-07-17 at 05:11: the HUD printed red "0.0 · FROZEN — frame
        // not advancing" while the producer's own counter went 33718 -> 33720 across 6s. The colony
        // was healthy. Cause: this colony advances ~1 frame per ~3s and the poll is 3.0s, so
        // consecutive samples land on the same frame roughly half the time; Δ=0 there is ALIASING,
        // not a frozen mind, and Rate() (PollWorker.cs:256) differences exactly one pair. So a
        // perfectly live colony flickered into a red alarm, forever. A false alarm spends trust
        // that does not refill — and the false-alarm leg is the one thing this HUD had earned.
        //
        // FIX: the RATE is still shown (it is a real magnitude), but it may no longer CONVICT.
        // FROZEN is dwell-gated on `colony.frame_stalled_ms` — wall clock since the counter last
        // actually moved — which is immune to the tick rate. 30s is ~10 expected frame intervals
        // here; a genuinely stopped mind trips it, aliasing never can.
        var rate = ExtractDoubleArray(TryPath2(r, "metrics.colony_frame_rate"));
        var lastRate = LastOf(rate);
        var stalledEl = TryPath2(r, "colony.frame_stalled_ms");
        long? stalledMs = stalledEl is JsonElement se && se.ValueKind == JsonValueKind.Number ? se.GetInt64() : null;
        const long FROZEN_DWELL_MS = 30000;
        // 2026-07-17 (gate hud-renderer-honesty): the dwell verdict is the pure, testable
        // RenderDecisions.ColonyLiveness — FROZEN only after the wall-clock dwell, never an aliased Δ=0.
        var (colonyState, colonyBrush) = RenderDecisions.ColonyLiveness(stalledMs, FROZEN_DWELL_MS);
        var frozen = colonyState == "frozen";
        ColonyRateValue.Text = lastRate.HasValue ? $"{lastRate.Value:F1}" : "—";
        // Colour follows the DWELL verdict, not the instantaneous sample — otherwise the number
        // would still flash red on an aliased zero and the fix would be cosmetic.
        ColonyRateValue.Foreground = (Brush)FindResource(colonyBrush);
        ColonyNote.Text = !stalledMs.HasValue
            ? "not measured"
            : frozen
                ? $"FROZEN — no new frame for {stalledMs.Value / 1000}s"
                : $"frames advancing (mind running) · last frame {stalledMs.Value / 1000}s ago";
        DrawSparkline(ColonySpark, rate, Color.FromRgb(46, 204, 113), 0, null);

        var verdict = TryPath(r, "colony.verdict");
        var driver = TryPath(r, "colony.driver");
        var star = TryPath(r, "colony.star");
        var cntEl = TryPath2(r, "colony.colony_count");
        var cnt = cntEl.HasValue && cntEl.Value.ValueKind == JsonValueKind.Number ? cntEl.Value.GetInt64().ToString() : "?";
        var tpsEl = TryPath2(r, "colony.tps");
        var tps = tpsEl.HasValue && tpsEl.Value.ValueKind == JsonValueKind.Number ? tpsEl.Value.GetDouble().ToString("F0") : "?";
        if (verdict == null) { ColonyDetail.Text = "colony: not measured"; ColonyDetail.Foreground = (Brush)FindResource("Nv"); }
        else
        {
            ColonyDetail.Text = $"verdict={verdict} · driver={driver ?? "?"} · {cnt} UNIs · tps {tps} · star {star ?? "?"}";
            // Only verdict=LIVE is green. driver=producer alone is NECESSARY BUT NOT SUFFICIENT
            // (the project's own colony rule) — the 2026-07-16 honesty fix, preserved here.
            ColonyDetail.Foreground = (Brush)FindResource(verdict == "LIVE" ? "Ok" : "Warn");
        }
    }

    // ---- THE AIR ALARM (THE ONE CHANGE) ------------------------------------------------------------
    // Extract the measured facts from the snapshot and feed the AlarmEngine, then annunciate whatever
    // it returns. `blind` is set when the snapshot GET failed entirely (service down) — that is itself
    // a BLIND alarm condition while armed, never a reason to stand down.
    private void RenderAlarm(JsonElement? r, bool blind)
    {
        AlarmFacts f;
        if (blind || r == null)
        {
            f = new AlarmFacts { Blind = true };
        }
        else
        {
            var rr = r.Value;
            var level = TryPath(rr, "air.level") ?? "UNKNOWN";
            var airStale = TryPath2(rr, "air.stale") is JsonElement se && se.ValueKind == JsonValueKind.True;
            bool known = !airStale && level != "UNKNOWN" && !string.IsNullOrEmpty(level);
            var streaming = TryPath2(rr, "air.streaming") is JsonElement st && st.ValueKind == JsonValueKind.True;
            var readersEl = TryPath2(rr, "egress.readers");
            long? readers = readersEl.HasValue && readersEl.Value.ValueKind == JsonValueKind.Number ? readersEl.Value.GetInt64() : (long?)null;
            var hudStale = TryPath2(rr, "hud.stale") is JsonElement hs && hs.ValueKind == JsonValueKind.True;
            // KEY REJECTED fires ONLY on the D5 uniReady branch — the fanout.* row that says a platform
            // is REJECTING while the ingest is publishing, NEVER the "YOUR KEY IS NOT IMPLICATED"
            // no-publisher branch (which is normal during the ARM-before-CONFIRM window).
            bool keyRejected = false;
            if (rr.TryGetProperty("health_checks", out var checks) && checks.ValueKind == JsonValueKind.Array)
                foreach (var c in checks.EnumerateArray())
                {
                    var id = TryPath(c, "id") ?? "";
                    if (!id.StartsWith("fanout.")) continue;
                    var okv = TryPath2(c, "ok") is JsonElement e2 && e2.ValueKind == JsonValueKind.True;
                    var detail = TryPath(c, "detail") ?? "";
                    if (!okv && detail.Contains("REJECTING")) keyRejected = true;
                }
            f = new AlarmFacts
            {
                StreamingFresh = known && streaming,
                StreamingKnownOff = known && !streaming,
                Readers = readers,
                KeyRejectedRow = keyRejected,
                Blind = hudStale,
            };
        }
        _lastAlarm = _alarm.Update(f, Environment.TickCount64);
        ApplyAlarm(_lastAlarm);
    }

    private void ApplyAlarm(AlarmDecision d)
    {
        if (d.Firing.Count == 0)
        {
            AlarmBanner.Visibility = Visibility.Collapsed;
            _annunciated.Clear();
            return;
        }
        AlarmBanner.Visibility = Visibility.Visible;
        AlarmText.Text = "⚠ AIR ALARM — " + d.Summary;

        // ACK buttons — one per firing code. Rebuild only when the firing SET changes (not every tick).
        var firingKey = string.Join(",", d.Firing.Select(c => c.ToString()).OrderBy(x => x));
        if (_sections.ShouldRepaint("alarm.ack", firingKey))
        {
            AlarmAckRow.Children.Clear();
            foreach (var code in d.Firing)
            {
                var captured = code;
                var btn = new System.Windows.Controls.Button
                {
                    Content = "ACK " + code, FontSize = 15, Padding = new Thickness(8, 3, 8, 3), Margin = new Thickness(0, 0, 6, 0),
                    Background = System.Windows.Media.Brushes.Transparent, Foreground = (Brush)FindResource("Bad"),
                    BorderBrush = (Brush)FindResource("Bad"), BorderThickness = new Thickness(1), Cursor = System.Windows.Input.Cursors.Hand,
                    ToolTip = "Silence this code's SOUND for 10 min. The red banner STAYS until the condition clears; this never disarms fan-out or cuts.",
                };
                btn.Click += (_, _) => { _alarm.Ack(captured, Environment.TickCount64, _lastAlarm); System.Media.SystemSounds.Beep.Play(); };
                AlarmAckRow.Children.Add(btn);
            }
        }

        // OFF-SCREEN legs: flash the taskbar + tray balloon ONCE per code per episode (not every 3s).
        foreach (var code in d.Firing)
            if (_annunciated.Add(code))
            {
                Flash();
                try { _tray?.ShowBalloonTip(6000, "UNI — AIR ALARM", AlarmEngine.Describe(code), WF.ToolTipIcon.Error); } catch { }
            }
        _annunciated.RemoveWhere(c => !d.Firing.Contains(c));   // a code that stopped will re-annunciate if it recurs

        // SOUND: recurring while any firing code is not ack-silenced. Playing on each 3s tick gives a
        // persistent audible alarm with no embedded asset; ACK silences it for 10 min.
        if (d.PlaySound) { try { System.Media.SystemSounds.Exclamation.Play(); } catch { } }
    }

    private void Flash()
    {
        try
        {
            var h = new WindowInteropHelper(this).Handle;
            if (h == IntPtr.Zero) return;
            var fw = new FLASHWINFO { cbSize = (uint)Marshal.SizeOf<FLASHWINFO>(), hwnd = h, dwFlags = FLASHW_ALL | FLASHW_TIMERNOFG, uCount = 6, dwTimeout = 0 };
            FlashWindowEx(ref fw);
        }
        catch { /* flashing is best-effort; never crash the glance surface over it */ }
    }

    // Null-safe numeric extraction (2026-07-17): TryPath2 returns a JsonElement? — but `?.GetInt64()`
    // only guards an ABSENT path, not a present-but-JSON-NULL value. A field the service ships as
    // `null` (e.g. hud.last_poll_age_ms before the first poll, or a not-measured count) made
    // `.GetInt64()` throw InvalidOperationException, and in an `async void` timer tick that CRASHED
    // the whole widget. Found the hard way when the service restarted under the alarm firing proof:
    // it served last_poll_age_ms:null before its first poll and the widget faulted. These helpers
    // return null for anything that is not a JSON Number — the glance surface never dies on a null.
    private static long? NumL(JsonElement? el) => el is JsonElement e && e.ValueKind == JsonValueKind.Number ? e.GetInt64() : (long?)null;
    private static int? NumI(JsonElement? el) => el is JsonElement e && e.ValueKind == JsonValueKind.Number ? e.GetInt32() : (int?)null;

    private static double? LastOf(double?[] a)
    {
        for (int i = a.Length - 1; i >= 0; i--) if (a[i].HasValue) return a[i];
        return null;
    }

    // Like LastOf but ALSO returns how many slots back the value is (0 = the newest slot). A large
    // slotsBack means the series has been null for that many polls — i.e. the number is stale even
    // though a value exists. Callers grey the value and state its age past ~2 measured intervals.
    // (gate hud-freshness-honest, 2026-07-17)
    private static (double? value, int slotsBack) LastOfAged(double?[] a)
    {
        for (int i = a.Length - 1; i >= 0; i--) if (a[i].HasValue) return (a[i], a.Length - 1 - i);
        return (null, -1);
    }

    // NO hardcoded door->URL map any more. door_lifecycle.cjs has always returned a real `href` per
    // door and the service now passes it through, so the SERVER owns every address. This is what
    // makes chip-side doors (producer/colony/colonycam/relay) clickable from here for the first time
    // WITHOUT putting a non-loopback IP literal in widget code — the old 5-entry dict couldn't reach
    // them precisely because hardcoding their addresses was (correctly) forbidden. The rule is
    // satisfied by not knowing the address, not by dropping the link.
    private static void OpenUrl(string url)
    {
        try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo { FileName = url, UseShellExecute = true }); }
        catch { /* opening a browser is best-effort; never crash the glance surface over it */ }
    }

    private void OnOpenGaia(object sender, RoutedEventArgs e)
    {
        // Address comes from the snapshot, not from a constant here.
        var href = _lastGaiaHref;
        if (!string.IsNullOrEmpty(href)) OpenUrl(href!);
    }
    private string? _lastGaiaHref;

    private void RenderDoors(JsonElement r)
    {
        // JITTER SKIP: rebuild only when the door register or hrefs actually changed. Otherwise the
        // 3s timer would tear down + rebuild all 14 tiles + access buttons and force WPF to remeasure
        // the whole scroll body, jittering every label by a subpixel.
        if (!r.TryGetProperty("door_open", out var doors) || doors.ValueKind != JsonValueKind.Object)
        {
            DoorsHeader.Text = "NOC — DOORS: not measured";
            // 2026-07-17 (gate hud-recovery-repaints): drop the cached hash so a recovery whose door
            // bytes are identical to the pre-outage state repaints instead of early-returning below.
            // Deliberately does NOT Clear the grid — a single 2500ms door-probe flake would otherwise
            // blank the largest panel; the last-good tiles stay under the "not measured" header until
            // real data returns and repaints them.
            _sections.Invalidate("doors");
            return;
        }
        if (!ChangedSince("doors", doors.GetRawText())) return;
        DoorsGrid.Children.Clear();
        AccessRow.Children.Clear();

        // Render EVERY door the snapshot carries, in the snapshot's own order. The old code walked a
        // hardcoded 13-key array against 14 live doors — the 14th was simply never drawn, and the
        // header hardcoded "13 DOORS" to match the bug. Both the tiles and the count now come from
        // the data. (gate: hud-all-doors-rendered)
        int n = 0, openN = 0, badN = 0;
        foreach (var prop in doors.EnumerateObject())
        {
            var key = prop.Name;
            var d = prop.Value;
            n++;
            var open = d.TryGetProperty("open", out var o) && o.ValueKind == JsonValueKind.True;
            var locked = d.TryGetProperty("locked", out var l) && l.ValueKind == JsonValueKind.True;
            // HONESTY FIX (2026-07-16): was `!(present && == False)` — a MISSING circle_ok rendered as
            // a green "ok" tile with zero evidence. Fail closed, same rule as open/locked above: only
            // an EXPLICIT true counts as ok.
            var circleOk = d.TryGetProperty("circle_ok", out var c) && c.ValueKind == JsonValueKind.True;
            if (open) openN++;
            if (!circleOk) badN++;
            var brush = !circleOk ? (Brush)FindResource("Bad")
                      : (open ? (Brush)FindResource("Ok")
                      : (Brush)FindResource("Mute"));
            var bg = !circleOk ? Color.FromArgb(0x30, 0xE5, 0x48, 0x4D)
                    : (open ? Color.FromArgb(0x30, 0x2E, 0xCC, 0x71)
                    : Color.FromArgb(0x30, 0x1E, 0x2A, 0x37));
            var url = d.TryGetProperty("href", out var hr) && hr.ValueKind == JsonValueKind.String ? hr.GetString() : null;
            var hasLink = !string.IsNullOrEmpty(url);
            var prediction = d.TryGetProperty("prediction", out var pr) && pr.ValueKind == JsonValueKind.String ? pr.GetString() : null;

            var stack = new StackPanel();
            stack.Children.Add(new TextBlock
            {
                // a small ↗ marks a tile that actually opens something
                Text = key + (locked ? " 🔒" : "") + (hasLink ? " ↗" : ""),
                FontSize = 16, FontWeight = FontWeights.SemiBold, Foreground = brush,
                HorizontalAlignment = HorizontalAlignment.Center,
                TextWrapping = TextWrapping.Wrap, TextAlignment = TextAlignment.Center,
            });
            // The prediction goes ON THE FACE, not only in a tooltip you have to hover to find.
            if (!string.IsNullOrEmpty(prediction))
                stack.Children.Add(new TextBlock
                {
                    Text = prediction, FontSize = 15, Foreground = (Brush)FindResource("Mute"),
                    HorizontalAlignment = HorizontalAlignment.Center, TextAlignment = TextAlignment.Center,
                    TextWrapping = TextWrapping.Wrap,
                });

            var border = new Border
            {
                Background = new SolidColorBrush(bg),
                BorderBrush = brush,
                BorderThickness = new Thickness(hasLink ? 1.6 : 1),
                CornerRadius = new CornerRadius(3),
                Margin = new Thickness(2),
                Padding = new Thickness(3, 4, 3, 4),
                Cursor = hasLink ? System.Windows.Input.Cursors.Hand : null,
                Child = stack,
                ToolTip = (prediction ?? key) + (hasLink ? $"\n▶ click to open {url}" : "\n(no web surface)")
                        + $"\nopen={open} locked={locked} circle_ok={circleOk}",
            };
            if (hasLink)
            {
                border.MouseLeftButtonUp += (_, _) => OpenUrl(url!);
                // Fully qualified: this file imports BOTH WinForms (Screen, for multi-monitor docking)
                // and WPF, so bare `Button`/`Brushes` are ambiguous.
                var b = new System.Windows.Controls.Button
                {
                    Content = key, FontSize = 16, Padding = new Thickness(8, 4, 8, 4), Margin = new Thickness(0, 0, 4, 4),
                    Background = System.Windows.Media.Brushes.Transparent, Foreground = (Brush)FindResource("Acc"),
                    BorderBrush = (Brush)FindResource("Line"), BorderThickness = new Thickness(1),
                    Cursor = System.Windows.Input.Cursors.Hand, ToolTip = url,
                };
                b.Click += (_, _) => OpenUrl(url!);
                AccessRow.Children.Add(b);
            }
            DoorsGrid.Children.Add(border);
        }
        DoorsHeader.Text = $"NOC — {n} DOORS · {openN} open · {badN} circle-broken";
        DoorsHeader.Foreground = (Brush)FindResource(badN > 0 ? "Bad" : "Mute");
        if (AccessRow.Children.Count == 0)
            AccessRow.Children.Add(new TextBlock { Text = "no door reported an href", FontSize = 16, Foreground = (Brush)FindResource("Mute"), FontStyle = FontStyles.Italic });
    }

    // ---- GAIA: seats + drift, honest about what is and isn't evidence -------------------------
    private void RenderGaia(JsonElement r)
    {
        _lastGaiaHref = TryPath(r, "gaia.href");
        OpenGaiaBtn.IsEnabled = !string.IsNullOrEmpty(_lastGaiaHref);
        // JITTER SKIP: seats + drift rebuild only when their bytes change (Gaia updates on a 120s
        // slow loop, so at 3s cadence this returns unchanged ~39 times in a row).
        var gaiaKey = (TryPath2(r, "gaia.seats")?.GetRawText() ?? "") + "|" +
                      (r.TryGetProperty("drift", out var drKey) ? drKey.GetRawText() : "");
        UpdateGaiaHeader(r);
        if (!ChangedSince("gaia", gaiaKey)) return;
        GaiaSeatsList.Children.Clear();
        DriftList.Children.Clear();

        var seats = TryPath2(r, "gaia.seats");
        if (seats.HasValue && seats.Value.ValueKind == JsonValueKind.Array)
        {
            foreach (var s in seats.Value.EnumerateArray())
            {
                var name = TryPath(s, "seat") ?? "?";
                var nSig = NumI(TryPath2(s, "signal_count")) ?? 0;
                var up = NumI(TryPath2(s, "up")) ?? 0;
                var down = NumI(TryPath2(s, "down")) ?? 0;
                var unknown = NumI(TryPath2(s, "unknown")) ?? 0;

                // Colour ONLY on real probe evidence. A seat whose signals carry no live probe
                // (repo/gates/science/...) is NOT "healthy" — it is unprobed, and says so.
                string brushKey; string note;
                if (nSig == 0) { brushKey = "Nv"; note = "no signals — unimplemented"; }
                else if (down > 0) { brushKey = "Bad"; note = $"{down} DOWN / {up} up"; }
                else if (up > 0) { brushKey = "Ok"; note = $"{up} up"; }
                else { brushKey = "Nv"; note = $"{unknown} signals, no live probe (not evidence of health)"; }

                var row = new Grid { Margin = new Thickness(0, 2, 0, 2) };
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(96) });
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(40) });
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                var t1 = new TextBlock { Text = name, FontFamily = new FontFamily("Cascadia Code, Consolas"), FontSize = 18, Foreground = (Brush)FindResource(brushKey), FontWeight = FontWeights.Bold };
                var t2 = new TextBlock { Text = nSig.ToString(), FontFamily = new FontFamily("Cascadia Code, Consolas"), FontSize = 18, Foreground = (Brush)FindResource("Dim"), TextAlignment = TextAlignment.Right };
                var t3 = new TextBlock { Text = note, FontSize = 16, Foreground = (Brush)FindResource("Mute"), Margin = new Thickness(6, 0, 0, 0), TextWrapping = TextWrapping.Wrap };
                Grid.SetColumn(t1, 0); Grid.SetColumn(t2, 1); Grid.SetColumn(t3, 2);
                row.Children.Add(t1); row.Children.Add(t2); row.Children.Add(t3);
                GaiaSeatsList.Children.Add(row);
            }
        }

        // DRIFT: each row's REAL equal. Was rendered as a bare name with the verdict discarded.
        if (r.TryGetProperty("drift", out var drift) && drift.ValueKind == JsonValueKind.Array && drift.GetArrayLength() > 0)
        {
            foreach (var d in drift.EnumerateArray())
            {
                var id = TryPath(d, "id") ?? "?";
                var eqEl = TryPath2(d, "equal");
                bool? eq = eqEl.HasValue
                    ? (eqEl.Value.ValueKind == JsonValueKind.True ? true : eqEl.Value.ValueKind == JsonValueKind.False ? false : (bool?)null)
                    : null;
                var txt = eq == true ? "MATCH" : eq == false ? "DRIFT" : "?";
                var bk = eq == true ? "Ok" : eq == false ? "Warn" : "Nv";
                var row = new Grid { Margin = new Thickness(0, 2, 0, 2) };
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(60) });
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                var v = new TextBlock { Text = txt, FontFamily = new FontFamily("Cascadia Code, Consolas"), FontSize = 16, FontWeight = FontWeights.Bold, Foreground = (Brush)FindResource(bk), TextAlignment = TextAlignment.Center };
                var t = new TextBlock { Text = id, FontFamily = new FontFamily("Cascadia Code, Consolas"), FontSize = 16, Foreground = (Brush)FindResource("Ink"), Margin = new Thickness(6, 0, 0, 0), TextWrapping = TextWrapping.Wrap };
                Grid.SetColumn(v, 0); Grid.SetColumn(t, 1);
                row.Children.Add(v); row.Children.Add(t);
                DriftList.Children.Add(row);
            }
        }
        else
        {
            DriftList.Children.Add(new TextBlock
            {
                Text = "no drift rows — Gaia not yet polled (slow loop, 120s)",
                FontSize = 16, Foreground = (Brush)FindResource("Mute"), FontStyle = FontStyles.Italic,
            });
        }
    }

    // The Gaia header shows an aging "Xs ago" that MUST keep updating even when the seat list is
    // cached (which it is, 39-of-40 refreshes — slow loop is 120s vs the 3s fast poll). Extracted so
    // it runs unconditionally on every refresh; the heavy seat/drift render is guarded separately.
    private void UpdateGaiaHeader(JsonElement r)
    {
        var polledAt = TryPath(r, "gaia.polled_at");
        var gErr = TryPath(r, "gaia.err");
        var seats = TryPath2(r, "gaia.seats");
        var seatCount = seats.HasValue && seats.Value.ValueKind == JsonValueKind.Array ? seats.Value.GetArrayLength() : 0;
        var age = "";
        if (polledAt != null && DateTime.TryParse(polledAt, null, System.Globalization.DateTimeStyles.RoundtripKind, out var pa))
            age = $" · {(DateTime.UtcNow - pa).TotalSeconds:F0}s ago";
        GaiaHeader.Text = seatCount == 0
            ? $"GAIA — no seats yet{(gErr != null ? $" ({gErr})" : " (first slow poll pending)")}"
            : $"GAIA — {seatCount} seats{age}{(gErr != null ? $" · STALE: {gErr}" : "")}";
        GaiaHeader.Foreground = (Brush)FindResource(seatCount == 0 || gErr != null ? "Warn" : "Mute");
    }

    // ---- HEALTH: the console's own board, finally surfaced ------------------------------------
    private void RenderHealth(JsonElement r)
    {
        if (!r.TryGetProperty("health_checks", out var checks) || checks.ValueKind != JsonValueKind.Array || checks.GetArrayLength() == 0)
        {
            HealthHeader.Text = "BROADCAST HEALTH — not measured (console unreachable)";
            HealthHeader.Foreground = (Brush)FindResource("Warn");
            HealthList.Children.Clear();
            // 2026-07-17 (gate hud-recovery-repaints): drop the cached hash on the not-measured path.
            // Without this, a recovery whose checks bytes are IDENTICAL to the pre-outage state makes
            // ChangedSince() below early-return, so the panel stays pinned on this empty "not measured"
            // view forever — an alarm stuck ON after the fault already cleared.
            _sections.Invalidate("health");
            return;
        }
        // JITTER SKIP: 13 checks with details that can be paragraph-long — a full teardown at 3s
        // jerked the whole page. Rebuild only on real change.
        if (!ChangedSince("health", checks.GetRawText())) return;
        HealthList.Children.Clear();
        int ok = 0, bad = 0;
        foreach (var c in checks.EnumerateArray())
        {
            var okv = TryPath2(c, "ok") is JsonElement e && e.ValueKind == JsonValueKind.True;
            if (okv) ok++; else bad++;
            var id = TryPath(c, "id") ?? "?";
            var detail = TryPath(c, "detail") ?? "";
            var row = new Grid { Margin = new Thickness(0, 2, 0, 2) };
            // 2026-07-17: the id column was a fixed 96px, which CLIPPED the check names — the live
            // surface read "restrea", "overloo", "colonyc". A truncated identifier on the one panel
            // that names a broadcast fault is not a cosmetic issue: it is the wrap-don't-truncate
            // law (4cb0205) broken on the panel just promoted above the fold. Each row is its own
            // Grid, so plain Auto would size every row differently and go ragged; a SharedSizeGroup
            // sizes the column to the LONGEST id across all rows and keeps them aligned. Grows with
            // the data instead of guessing a pixel count that rots the next time a check is added.
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto, SharedSizeGroup = "hcid" });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            var t1 = new TextBlock { Text = (okv ? "● " : "✕ ") + id, FontFamily = new FontFamily("Cascadia Code, Consolas"), FontSize = 18, FontWeight = FontWeights.SemiBold, Foreground = (Brush)FindResource(okv ? "Ok" : "Bad") };
            var t2 = new TextBlock { Text = detail, FontSize = 16, Foreground = (Brush)FindResource("Mute"), Margin = new Thickness(4, 0, 0, 0), TextWrapping = TextWrapping.Wrap, ToolTip = detail };
            Grid.SetColumn(t1, 0); Grid.SetColumn(t2, 1);
            row.Children.Add(t1); row.Children.Add(t2);
            HealthList.Children.Add(row);
        }
        HealthHeader.Text = $"BROADCAST HEALTH — {ok} ok · {bad} failing";
        HealthHeader.Foreground = (Brush)FindResource(bad > 0 ? "Bad" : "Ok");
    }

    private void RenderSight(JsonElement r)
    {
        var findings = TryPath2(r, "sight.findings");
        if (!findings.HasValue || findings.Value.ValueKind != JsonValueKind.Array)
        { SightList.Children.Clear(); return; }
        if (!ChangedSince("sight", findings.Value.GetRawText())) return;
        SightList.Children.Clear();
        foreach (var f in findings.Value.EnumerateArray())
        {
            var sev = TryPath(f, "severity") ?? "info";
            var title = TryPath(f, "title") ?? "?";
            var detail = TryPath(f, "detail") ?? "";
            SightList.Children.Add(new TextBlock
            {
                Text = (sev == "bad" ? "✕ " : sev == "warn" ? "! " : "· ") + title,
                FontSize = 16, TextWrapping = TextWrapping.Wrap, ToolTip = detail,
                Foreground = (Brush)FindResource(sev == "bad" ? "Bad" : sev == "warn" ? "Warn" : "Dim"),
            });
        }
    }

    private void RenderGates(JsonElement r)
    {
        if (!r.TryGetProperty("gates", out var gates) || gates.ValueKind != JsonValueKind.Array) return;
        // JITTER SKIP: the ladder is 65 rows and the ledger is append-only — verdicts change only
        // on a real commit, never on the 3s tick. Guarding this saves the majority of the layout
        // work per refresh.
        if (!ChangedSince("gates", gates.GetRawText())) return;
        GatesList.Children.Clear();

        // NON-PASS FIRST. The whole ladder renders (the outer scroller reaches it — the old
        // MaxHeight="160" inner scroller showed ~11 of 65), but what needs attention sorts to the
        // top instead of being buried under 43 PASS rows. (gate: hud-gates-all-seeable)
        static int Rank(string v) => v switch { "FAIL" => 0, "PARTIAL" => 1, "WITHHELD" => 2, "PENDING" => 3, "PASS" => 5, _ => 4 };
        var rows = gates.EnumerateArray().ToList();
        rows.Sort((a, b) =>
        {
            var va = TryPath(a, "verdict") ?? "?"; var vb = TryPath(b, "verdict") ?? "?";
            var c = Rank(va).CompareTo(Rank(vb));
            return c != 0 ? c : string.CompareOrdinal(TryPath(a, "name") ?? "", TryPath(b, "name") ?? "");
        });

        var counts = new Dictionary<string, int>();
        foreach (var g in rows)
        {
            var vv = TryPath(g, "verdict") ?? "?";
            counts[vv] = counts.GetValueOrDefault(vv) + 1;
        }
        // Summary computed from the SAME rows we render, so header and body can never disagree.
        GatesHeader.Text = "SOC — GATE LADDER · " + rows.Count + " gates · " +
            string.Join(" · ", counts.OrderBy(k => Rank(k.Key)).Select(k => $"{k.Value} {k.Key}"));
        GatesHeader.Foreground = (Brush)FindResource(counts.GetValueOrDefault("FAIL") > 0 ? "Bad" : "Mute");

        // COLUMN HEADER — the operator was rightfully asking "there is a right side column, no label,
        // I do not know WTF it is". The mystery column was `evidence_class`. Now labeled + a tooltip
        // spelling out what A/B/C/Sec mean.
        var hdrRow = new Grid { Margin = new Thickness(0, 4, 0, 4) };
        hdrRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(90) });
        hdrRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        hdrRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(60) });
        var h1 = new TextBlock { Text = "VERDICT", FontSize = 15, FontWeight = FontWeights.Bold, Foreground = (Brush)FindResource("Ink"), TextAlignment = TextAlignment.Center };
        var h2 = new TextBlock { Text = "GATE", FontSize = 15, FontWeight = FontWeights.Bold, Foreground = (Brush)FindResource("Ink"), Margin = new Thickness(10, 0, 0, 0) };
        var h3 = new TextBlock { Text = "CLASS", FontSize = 15, FontWeight = FontWeights.Bold, Foreground = (Brush)FindResource("Ink"), TextAlignment = TextAlignment.Right,
            ToolTip = "Evidence class — how strong the proof is:\n" +
                      "A  = deterministic, machine-reproducible (e.g. gate script exit 0 + saved artifact)\n" +
                      "B  = strong, witnessed live (e.g. captured screenshot, live probe log)\n" +
                      "C  = supporting evidence (design intent, static/read-only checks)\n" +
                      "Sec = security-related\n" +
                      "pend = pre-registered, awaiting evidence" };
        Grid.SetColumn(h1, 0); Grid.SetColumn(h2, 1); Grid.SetColumn(h3, 2);
        hdrRow.Children.Add(h1); hdrRow.Children.Add(h2); hdrRow.Children.Add(h3);
        GatesList.Children.Add(hdrRow);
        // A thin separator under the header so the operator sees the columns are a table, not prose.
        GatesList.Children.Add(new Border { Height = 1, Background = (Brush)FindResource("Line"), Margin = new Thickness(0, 0, 0, 4) });

        foreach (var g in rows)
        {
            var name = TryPath(g, "name") ?? "?";
            var verdict = TryPath(g, "verdict") ?? "?";
            var ec = TryPath(g, "evidence_class") ?? "";
            var vBrush = (Brush)FindResource(verdict switch { "PASS" => "Ok", "PARTIAL" => "Warn", "FAIL" => "Bad", _ => "Nv" });
            var row = new Grid { Margin = new Thickness(0, 3, 0, 3) };
            // Column widths must match the header row above EXACTLY, or verdict/class won't align.
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(90) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(60) });
            // WPF's FontSize is DEVICE-INDEPENDENT UNITS (1/96 inch), NOT points. So the old
            // FontSize=12 rendered at ~9 physical points, not the 12pt it read like -- which is why
            // the operator kept saying "still not readable" through three "font bumps". Correct math:
            // WPF units = points × 96/72 = points × 4/3. So real 12pt = 16 DIU, real 14pt = 18.67.
            // Sizing by REAL POINTS from here on:
            //   14pt bold verdict, 14pt mono name (~18-19 DIU), 12pt class (~16 DIU).
            var v = new TextBlock { Text = verdict, FontFamily = new FontFamily("Cascadia Code, Consolas"), FontSize = 18, Foreground = vBrush, FontWeight = FontWeights.Bold, TextAlignment = TextAlignment.Center };
            // WRAP, don't ellipsize. Some gate names run 30+ chars (hud-honesty-producer-verdict-fix,
            // endpoints-preset-dropdown-multi-account, forage-pureworld-graduation) — at 12pt mono
            // a hidden or side-scrollable name is refused ("I will not accept a side scroll" -- op).
            // A two-line name is READ; an ellipsis is INFORMATION LOST.
            var n = new TextBlock { Text = name, FontFamily = new FontFamily("Cascadia Code, Consolas"), FontSize = 18, Foreground = (Brush)FindResource("Ink"), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(10, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center };
            var e = new TextBlock { Text = ec, FontFamily = new FontFamily("Cascadia Code, Consolas"), FontSize = 15, Foreground = (Brush)FindResource("Mute"), TextAlignment = TextAlignment.Right, VerticalAlignment = VerticalAlignment.Center };
            Grid.SetColumn(v, 0); Grid.SetColumn(n, 1); Grid.SetColumn(e, 2);
            row.Children.Add(v); row.Children.Add(n); row.Children.Add(e);
            GatesList.Children.Add(row);
        }
    }

    private async Task RenderAudience()
    {
        AudienceList.Children.Clear();
        var env = await _client.GetAsync("/api/hud/audience/recent?n=15");
        if (env == null) return;
        if (!env.Value.TryGetProperty("result", out var r) || !r.TryGetProperty("rows", out var rows) || rows.ValueKind != JsonValueKind.Array) return;
        // Reverse chronological — API returns oldest first, display newest first
        var arr = rows.EnumerateArray().ToArray();
        for (int i = arr.Length - 1; i >= 0; i--)
        {
            var row = arr[i];
            var author = TryPath(row, "author") ?? "?";
            var text = TryPath(row, "text") ?? "";
            var source = TryPath(row, "source") ?? "?";
            var box = new StackPanel { Margin = new Thickness(0, 1, 0, 1) };
            box.Children.Add(new TextBlock { Text = $"[{source}] {author}", FontFamily = new FontFamily("Cascadia Code, Consolas"), FontSize = 8, Foreground = (Brush)FindResource("Mute") });
            box.Children.Add(new TextBlock { Text = text, FontSize = 15, Foreground = (Brush)FindResource("Ink"), TextWrapping = TextWrapping.Wrap });
            AudienceList.Children.Add(box);
        }
        if (arr.Length == 0)
            AudienceList.Children.Add(new TextBlock { Text = "no audience rows yet — POST /api/hud/audience/publish to feed the ring", FontSize = 16, Foreground = (Brush)FindResource("Mute"), FontStyle = FontStyles.Italic, TextWrapping = TextWrapping.Wrap });
    }

    // ---- fan-out ARM/DISARM (2026-07-16) ---------------------------------------------------------
    // POSTs to the command center's /api/endpoints. x-uni-cc:1 satisfies its CSRF fence (a custom
    // header forces a CORS preflight, so no arbitrary web page can fire this from the operator's
    // browser — see command_center.cjs). This widget IS the operator's own deliberate click.
    private async Task<JsonElement?> PostEndpoints(object body)
    {
        try
        {
            var json = JsonSerializer.Serialize(body);
            using var req = new HttpRequestMessage(HttpMethod.Post, CcBase + "/api/endpoints")
            { Content = new StringContent(json, Encoding.UTF8, "application/json") };
            req.Headers.Add("x-uni-cc", "1");
            using var resp = await _cc.SendAsync(req);
            var raw = await resp.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<JsonElement>(raw);
        }
        catch { return null; }
    }

    private async Task RefreshArmStatus()
    {
        if (_armBusy) return; // don't fight an in-flight arm/disarm click with a concurrent poll
        var r = await PostEndpoints(new { action = "status" });
        if (r == null) { ArmStatus.Text = "fan-out: console unreachable"; ArmStatus.Foreground = (Brush)FindResource("Dim"); return; }
        var armed = r.Value.TryGetProperty("armed", out var a) && a.ValueKind == JsonValueKind.True;
        var hasPin = r.Value.TryGetProperty("hasPin", out var hp) && hp.ValueKind == JsonValueKind.True;
        var fanoutN = r.Value.TryGetProperty("fanout", out var fo) && fo.ValueKind == JsonValueKind.Number ? fo.GetInt32() : 0;
        // 2026-07-17 (88-agent HUD sweep, defect #8). The console computes `pinOrphan` — a PIN
        // wrapper on disk whose key store is GONE, so the PIN is accepted, the passphrase unwraps,
        // and it opens nothing. The console's own comment says "It is cheaply detectable NOW, so
        // say it NOW." It shipped the field; the console panel rendered it; THIS surface — the one
        // that exists so the operator does NOT have to open the console at 02:40 — read only
        // armed/hasPin/fanout and dropped it. The result was a calm grey "disarmed" and a lit ARM
        // button all night, failing at the one moment it is pressed: seconds before air.
        var pinOrphan = r.Value.TryGetProperty("pinOrphan", out var po) && po.ValueKind == JsonValueKind.True;
        var pinNote = r.Value.TryGetProperty("pinNote", out var pn) && pn.ValueKind == JsonValueKind.String ? pn.GetString() : null;
        if (armed) { ArmStatus.Text = $"fan-out: ● ARMED ({fanoutN}) — GO LIVE is still your typed CONFIRM"; ArmStatus.Foreground = (Brush)FindResource("Bad"); }
        else if (pinOrphan) { ArmStatus.Text = "fan-out: " + (pinNote ?? "PIN ORPHANED — it unwraps nothing. Set your keys + PIN again."); ArmStatus.Foreground = (Brush)FindResource("Bad"); }
        else if (!hasPin) { ArmStatus.Text = "fan-out: disarmed — no PIN set yet (console → Streaming Endpoints)"; ArmStatus.Foreground = (Brush)FindResource("Mute"); }
        else { ArmStatus.Text = "fan-out: disarmed"; ArmStatus.Foreground = (Brush)FindResource("Dim"); }
        // Never offer a button whose only possible outcome is a failure seconds before air.
        ArmBtn.IsEnabled = hasPin && !armed && !pinOrphan;
        ArmPinBox.IsEnabled = hasPin && !armed && !pinOrphan;
    }

    private async void OnArm(object sender, RoutedEventArgs e)
    {
        var pin = ArmPinBox.Password;
        if (pin.Length < 4) { ArmStatus.Text = "fan-out: enter your 4-8 digit PIN first"; ArmStatus.Foreground = (Brush)FindResource("Warn"); return; }
        _armBusy = true; ArmBtn.IsEnabled = false;
        try
        {
            var r = await PostEndpoints(new { action = "pin-arm", pin });
            ArmPinBox.Password = "";
            if (r == null) { ArmStatus.Text = "fan-out: console unreachable — ARM failed"; ArmStatus.Foreground = (Brush)FindResource("Bad"); return; }
            var err = r.Value.TryGetProperty("err", out var eEl) && eEl.ValueKind == JsonValueKind.String ? eEl.GetString() : null;
            if (err != null) { ArmStatus.Text = $"fan-out: ARM failed — {err}"; ArmStatus.Foreground = (Brush)FindResource("Bad"); return; }
        }
        finally { _armBusy = false; }
        await RefreshArmStatus();
    }

    private async void OnDisarm(object sender, RoutedEventArgs e)
    {
        // No PIN required — disarming is always allowed, one click, no barrier (matches the console's
        // own OFF-AIR discipline: stopping must never be gated behind a code).
        _armBusy = true; DisarmBtn.IsEnabled = false;
        try { await PostEndpoints(new { action = "pin-disarm" }); }
        finally { _armBusy = false; DisarmBtn.IsEnabled = true; }
        await RefreshArmStatus();
    }

    private void DrawSparkline(Canvas c, double?[] values, Color color, double? forceMin, double? forceMax)
    {
        c.Children.Clear();
        if (values.Length < 2) return;
        var clean = values.Where(v => v.HasValue).Select(v => v!.Value).ToArray();
        if (clean.Length < 2) return;
        var min = forceMin ?? clean.Min();
        var max = forceMax ?? clean.Max();
        if (Math.Abs(max - min) < 0.0001) max = min + 1;
        var w = c.ActualWidth > 0 ? c.ActualWidth : 140;
        var h = c.ActualHeight > 0 ? c.ActualHeight : 24;
        var poly = new Polyline { Stroke = new SolidColorBrush(color), StrokeThickness = 1.4 };
        var step = w / (values.Length - 1);
        for (int i = 0; i < values.Length; i++)
        {
            if (!values[i].HasValue) continue;
            var x = i * step;
            var y = h - 1 - ((values[i]!.Value - min) / (max - min)) * (h - 2);
            poly.Points.Add(new Point(x, y));
        }
        c.Children.Add(poly);
    }

    // ---- docking + window state + tray + hotkey ---------------------------
    // The monitor the window currently sits on (multi-monitor aware), falling back to primary.
    private WF.Screen CurrentScreen()
    {
        try
        {
            var h = new WindowInteropHelper(this).Handle;
            if (h != IntPtr.Zero) return WF.Screen.FromHandle(h);
        }
        catch { }
        return WF.Screen.PrimaryScreen!;
    }

    // WF.Screen bounds are physical device pixels; WPF Left/Top/Width/Height are DIPs. This scale
    // converts between them so docking lands correctly at non-100% display scaling (the old code
    // assumed 100% and drifted on scaled displays).
    private (double sx, double sy) DipScale()
    {
        var src = PresentationSource.FromVisual(this);
        if (src?.CompositionTarget != null)
            return (src.CompositionTarget.TransformToDevice.M11, src.CompositionTarget.TransformToDevice.M22);
        return (1.0, 1.0);
    }

    private void DockTo(DockEdge edge)
    {
        // Docking always operates on a normal (non-maximized/minimized) window, so it works even when
        // the operator got stuck maximized — this is the escape hatch from the old no-restore trap.
        if (WindowState != WindowState.Normal) WindowState = WindowState.Normal;
        _dock = edge;
        var wa = CurrentScreen().WorkingArea; // work area = monitor minus taskbar
        var (sx, sy) = DipScale();
        double waLeft = wa.Left / sx, waTop = wa.Top / sy, waW = wa.Width / sx, waH = wa.Height / sy;
        const double margin = 8;
        // The dock width is the REAL default width the operator sees — the Window's Width attribute
        // only survives until the first DockTo(), which docks Right on load. Widened 340 -> 440 ->
        // 600 (2026-07-16, in that order): the mixer board demands more horizontal room than a
        // 'dock' traditionally gets, because gate names, health details, and drift ids are
        // information-dense long strings that must NEVER truncate with ellipsis and MUST NEVER
        // horizontal-scroll ("I will not accept a side scroll" -- operator, on the 440 revision).
        // On a 1920+ display 600px is ~31% of screen — appropriate for a NOC panel, not a chip.
        // Kept as ONE named constant so the XAML default and the dock cannot drift apart again.
        const double dockW = 600;
        const double edgeH = 300;
        switch (edge)
        {
            case DockEdge.Right:
                Width = Math.Min(dockW, waW); Height = waH - 2 * margin;
                Left = waLeft + waW - Width - margin; Top = waTop + margin; break;
            case DockEdge.Left:
                Width = Math.Min(dockW, waW); Height = waH - 2 * margin;
                Left = waLeft + margin; Top = waTop + margin; break;
            case DockEdge.Top:
                Height = Math.Min(edgeH, waH - 2 * margin); Width = waW - 2 * margin;
                Left = waLeft + margin; Top = waTop + margin; break;
            case DockEdge.Bottom:
                Height = Math.Min(edgeH, waH - 2 * margin); Width = waW - 2 * margin;
                Left = waLeft + margin; Top = waTop + waH - Height - margin; break;
            case DockEdge.Float:
                Width = dockW; Height = Math.Min(900, waH - 2 * margin);
                Left = waLeft + (waW - Width) / 2; Top = waTop + Math.Max(margin, (waH - Height) / 2); break;
        }
    }

    // Cycle through the docks from the title-bar ⤢ button: Right → Left → Top → Bottom → Float → Right.
    private void CycleDock()
    {
        var next = _dock switch
        {
            DockEdge.Right => DockEdge.Left,
            DockEdge.Left => DockEdge.Top,
            DockEdge.Top => DockEdge.Bottom,
            DockEdge.Bottom => DockEdge.Float,
            _ => DockEdge.Right,
        };
        DockTo(next);
    }

    // If the window ended up entirely off every monitor (a stale saved position, a disconnected
    // display), snap it back to a right dock so it can never be lost off-screen again.
    private void EnsureOnScreen()
    {
        try
        {
            var (sx, sy) = DipScale();
            var w = Math.Max(1, ActualWidth > 0 ? ActualWidth : Width);
            var h = Math.Max(1, ActualHeight > 0 ? ActualHeight : Height);
            var rect = new System.Drawing.Rectangle(
                (int)(Left * sx), (int)(Top * sy), (int)(w * sx), (int)(h * sy));
            bool onScreen = WF.Screen.AllScreens.Any(s => s.WorkingArea.IntersectsWith(rect));
            if (!onScreen) DockTo(DockEdge.Right);
        }
        catch { DockTo(DockEdge.Right); }
    }

    // The one reliable "bring it back" path — used by the tray icon and the hotkey. Restores from
    // minimized OR hidden, re-asserts topmost, activates, and guarantees it lands on a real monitor.
    private void ShowWidget()
    {
        Dispatcher.Invoke(() =>
        {
            Show();
            if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
            Topmost = true;
            Activate();
            EnsureOnScreen();
        });
    }

    private void SetupTray()
    {
        _tray = new WF.NotifyIcon
        {
            Icon = System.Drawing.SystemIcons.Application,
            Visible = true,
            Text = "UNI HUD — click to show",
        };
        // A tray LEFT-click always SHOWS (never hides) — the tray icon is the guaranteed recovery
        // button. Hiding is done deliberately via the title-bar 🗕, the hotkey, or the menu.
        _tray.MouseClick += (_, e) => { if (e.Button == WF.MouseButtons.Left) ShowWidget(); };
        _tray.DoubleClick += (_, _) => ShowWidget();
        var menu = new WF.ContextMenuStrip();
        menu.Items.Add("Show", null, (_, _) => ShowWidget());
        menu.Items.Add("Hide (Ctrl+Shift+H)", null, (_, _) => Dispatcher.Invoke(Hide));
        menu.Items.Add("-");
        menu.Items.Add("Dock Right", null, (_, _) => Dispatcher.Invoke(() => DockTo(DockEdge.Right)));
        menu.Items.Add("Dock Left", null, (_, _) => Dispatcher.Invoke(() => DockTo(DockEdge.Left)));
        menu.Items.Add("Dock Top", null, (_, _) => Dispatcher.Invoke(() => DockTo(DockEdge.Top)));
        menu.Items.Add("Dock Bottom", null, (_, _) => Dispatcher.Invoke(() => DockTo(DockEdge.Bottom)));
        menu.Items.Add("Float", null, (_, _) => Dispatcher.Invoke(() => DockTo(DockEdge.Float)));
        menu.Items.Add("Maximize / Restore", null, (_, _) => Dispatcher.Invoke(ToggleMaxRestore));
        menu.Items.Add("-");
        menu.Items.Add("Quit", null, (_, _) => Quit());
        _tray.ContextMenuStrip = menu;
    }

    private void SetupHotkey()
    {
        // Ctrl+Shift+H toggles: if visible+normal → hide to tray; otherwise → show + restore + on-screen.
        _hotkey = new HotKey(this, ToggleVisibility);
        _hotkey.Register();
    }

    private void ToggleVisibility()
    {
        Dispatcher.Invoke(() =>
        {
            if (IsVisible && WindowState != WindowState.Minimized) Hide();
            else ShowWidget();
        });
    }

    private void ToggleMaxRestore()
    {
        WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
    }

    private void Quit()
    {
        try { _hotkey?.Dispose(); } catch { }
        try { _tray?.Dispose(); } catch { }
        Application.Current.Shutdown();
    }

    // ---- event handlers ----------------------------------------------------
    private void OnStateChanged(object sender, EventArgs e)
    {
        // Keep the max/restore glyph honest, and never let a minimize strand the window with no
        // taskbar button (ShowInTaskbar=True already guarantees the taskbar button; this just keeps
        // the button glyph in sync).
        if (MaxBtn != null) MaxBtn.Content = WindowState == WindowState.Maximized ? "❐" : "▢";
    }
    private void OnMinimize(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;
    private void OnMaxRestore(object sender, RoutedEventArgs e) => ToggleMaxRestore();
    private void OnCycleDock(object sender, RoutedEventArgs e) => CycleDock();
    private void OnHide(object sender, RoutedEventArgs e) => Hide();
    private void OnQuit(object sender, RoutedEventArgs e) => Quit();
    private void OnDockRight(object sender, RoutedEventArgs e) => DockTo(DockEdge.Right);
    private void OnDockLeft(object sender, RoutedEventArgs e) => DockTo(DockEdge.Left);
    private void OnDockTop(object sender, RoutedEventArgs e) => DockTo(DockEdge.Top);
    private void OnDockBottom(object sender, RoutedEventArgs e) => DockTo(DockEdge.Bottom);
    private void OnUndock(object sender, RoutedEventArgs e) => DockTo(DockEdge.Float);

    // ---- json helpers ------------------------------------------------------
    private static string? TryPath(JsonElement el, string dotted)
    {
        var e2 = TryPath2(el, dotted);
        return e2?.ValueKind == JsonValueKind.String ? e2?.GetString() : null;
    }
    private static JsonElement? TryPath2(JsonElement el, string dotted)
    {
        var cur = el;
        foreach (var part in dotted.Split('.'))
        {
            if (cur.ValueKind != JsonValueKind.Object) return null;
            if (!cur.TryGetProperty(part, out var next)) return null;
            cur = next;
        }
        return cur;
    }
    private static double?[] ExtractDoubleArray(JsonElement? el)
    {
        if (!el.HasValue || el.Value.ValueKind != JsonValueKind.Array) return Array.Empty<double?>();
        return el.Value.EnumerateArray().Select(v =>
            v.ValueKind == JsonValueKind.Number ? (double?)v.GetDouble() :
            v.ValueKind == JsonValueKind.Null ? null : (double?)null).ToArray();
    }
}
