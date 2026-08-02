// HttpApiHost.cs — JSON-only HTTP API. No HTML routes anywhere.
// HttpListener on 127.0.0.1:8100. GET-only + two POSTs (audience/publish, sight/push).

using System.Net;
using System.Text;
using System.Text.Json;

namespace UNI.Hud.Service;

public sealed class HttpApiHost : BackgroundService
{
    private readonly HudState _state;
    private readonly EventLogger _log;
    private readonly ILogger<HttpApiHost> _logger;
    private readonly HttpListener _listener;

    public HttpApiHost(HudState state, EventLogger log, ILogger<HttpApiHost> logger)
    {
        _state = state; _log = log; _logger = logger;
        _listener = new HttpListener();
        var port = int.TryParse(Environment.GetEnvironmentVariable("HUD_PORT"), out var p) ? p : 8100;
        // Bind loopback for now (LAN binding requires urlacl reserve — do that in installer if needed)
        _listener.Prefixes.Add($"http://127.0.0.1:{port}/");
        _listener.Prefixes.Add($"http://localhost:{port}/");
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            _listener.Start();
            _logger.LogInformation("HTTP API listening on 127.0.0.1:8100");
        }
        catch (Exception e)
        {
            _logger.LogError(e, "failed to start HttpListener");
            _log.Error(EventLogger.EvtServerCrash, $"HttpListener bind failed: {e.Message}");
            // Rethrow: a service that cannot bind its listener is not "running" in any
            // meaningful sense. Swallowing this here left the process alive with SCM
            // reporting Status=Running while :8100 stayed permanently dead -- the
            // sc.exe failure recovery actions (restart/5000...) never fired because the
            // process never actually exited. Let the Generic Host stop the process so
            // SCM's own recovery policy can do its job.
            throw;
        }
        // HttpListener.GetContextAsync() takes no CancellationToken, so the loop below
        // cannot observe stoppingToken while blocked waiting for the next request --
        // without this registration, a graceful stop (SCM stop, service restart, or a
        // normal `sc stop`) would hang until no new request ever arrives, forcing SCM
        // to eventually time out and hard-kill the process. Registering Stop() against
        // the token makes GetContextAsync() throw HttpListenerException immediately on
        // cancellation, so the loop below exits promptly and shutdown is actually graceful.
        using var stopReg = stoppingToken.Register(() => { try { _listener.Stop(); } catch { } });

        while (!stoppingToken.IsCancellationRequested)
        {
            HttpListenerContext ctx;
            try { ctx = await _listener.GetContextAsync(); }
            catch (HttpListenerException) { break; }
            catch (ObjectDisposedException) { break; }
            _ = Task.Run(() => HandleAsync(ctx));
        }
        try { _listener.Stop(); } catch { }
    }

    private async Task HandleAsync(HttpListenerContext ctx)
    {
        try
        {
            var path = ctx.Request.Url?.AbsolutePath ?? "/";
            var method = ctx.Request.HttpMethod;
            ctx.Response.Headers["Cache-Control"] = "no-store";
            ctx.Response.Headers["X-UNI-HUD"] = "UNI.Hud.Service@0.2";
            // Deliberately NO Access-Control-Allow-Origin header. The only real client is
            // UNI.Hud.Widget (a native WPF app, not a browser) -- CORS serves no purpose
            // here and a wildcard previously let ANY web page the operator's browser
            // loaded read this service's JSON (internal upstream URLs, git commit, gate
            // verdicts, live on-air status, audience rows) via a same-origin-free fetch(),
            // defeating the loopback-only binding's entire purpose. If a browser client is
            // ever genuinely needed, add an explicit per-request origin allow-list here --
            // never "*".

            if (method == "GET" && path == "/api/hud/health") {
                // 2026-07-17 (gate hud-health-derived-not-literal): `ok = true` was a hardcoded
                // literal — a wedged poll loop still reported UP, and launcher `hud_up` trusts this
                // route, so the whole "is the HUD alive" signal was unfalsifiable. Derive `ok` from
                // LastPollAt recency: the loop must have polled within 3x its MEASURED interval
                // (never the nominal 3000 — the loop has genuinely run at 11s/18s under load, and a
                // nominal threshold would flap for a healthy-but-slow loop). No poll yet => not ok.
                var interval = _state.MeasuredIntervalMs ?? 3000.0;
                var ageMs = _state.LastPollAt.HasValue
                    ? (DateTime.UtcNow - _state.LastPollAt.Value).TotalMilliseconds : (double?)null;
                var ok = ageMs.HasValue && ageMs.Value < 3.0 * interval;
                await SendJson(ctx, 200, Envelope(new {
                ok,
                stale = !ok,
                last_poll_age_ms = ageMs.HasValue ? (long?)Math.Round(ageMs.Value) : null,
                uptime_ms = (long)(DateTime.UtcNow - _state.StartedAt).TotalMilliseconds,
                poll_count = _state.PollCount,
                last_poll_at = _state.LastPollAt?.ToString("O"),
                port = 8100,
                pid = Environment.ProcessId,
                git_commit = _state.GitCommit,
                module_version_id = _state.ModuleVersionId,
                user_sight_last_push_at = _state.UserSightLastPushAt,
                user_sight_finding_count = _state.UserSightFindings.Count,
            })); return; }

            if (method == "GET" && path == "/api/hud/snapshot") { await SendJson(ctx, 200, Envelope(SnapshotBuilder.Build(_state))); return; }

            if (method == "GET" && path == "/api/hud/sight") { await SendJson(ctx, 200, Envelope((object?)_state.LastSight ?? new { total = 0, findings = Array.Empty<object>() })); return; }

            if (method == "GET" && path == "/api/hud/discovery") { await SendJson(ctx, 200, Envelope(new {
                what = "UNI HUD backend service (real Windows Service via ServiceBase)",
                version = "UNI.Hud.Service@0.2",
                routes = new Dictionary<string, string> {
                    ["GET /api/hud/health"] = "cheap liveness",
                    ["GET /api/hud/snapshot"] = "composed view (upstreams + door + gates + audience + sight + metrics)",
                    ["GET /api/hud/sight"] = "sight envelope (contradictions + rot + runaway + user-mode)",
                    ["GET /api/hud/audience/recent"] = "recent audience rows",
                    ["POST /api/hud/audience/publish"] = "loopback+x-uni-cc:1, sanitizer-vouched row",
                    ["POST /api/hud/sight/push"] = "loopback+x-uni-cc:1, user-mode helper findings",
                    ["GET /api/hud/discovery"] = "THIS route",
                },
                laws = new[] {
                    "GET-only except two loopback+x-uni-cc:1 POSTs",
                    "No HTML anywhere. This service returns application/json only.",
                    "Reads never actuate. No upstream mutation.",
                    "Real ServiceBase implementation (Microsoft.Extensions.Hosting.WindowsServices).",
                },
            })); return; }

            if (method == "GET" && path == "/api/hud/audience/recent")
            {
                var nStr = ctx.Request.QueryString["n"];
                var n = int.TryParse(nStr, out var nv) ? nv : 20;
                await SendJson(ctx, 200, Envelope(new { n, rows = _state.Audience.Recent(n) }));
                return;
            }

            if (path == "/api/hud/audience/publish")
            {
                if (method != "POST") { await SendJson(ctx, 405, new { err = "method_not_allowed" }); return; }
                if (!IsLoopback(ctx)) { await SendJson(ctx, 403, new { err = "loopback-only" }); return; }
                if (ctx.Request.Headers["x-uni-cc"] != "1") { await SendJson(ctx, 403, new { err = "x-uni-cc-header-required" }); return; }
                if (!(ctx.Request.ContentType?.StartsWith("application/json", StringComparison.OrdinalIgnoreCase) ?? false))
                { await SendJson(ctx, 415, new { err = "content-type must be application/json" }); return; }
                var body = await ReadBody(ctx.Request, 64 * 1024);
                if (body == null) { await SendJson(ctx, 413, new { err = "payload-too-large" }); return; }
                JsonElement obj;
                try { obj = JsonSerializer.Deserialize<JsonElement>(body); }
                catch { await SendJson(ctx, 400, new { err = "bad-json" }); return; }
                var (ok, code, msg, _) = _state.Audience.Accept(obj);
                if (!ok) { _log.Warn(EventLogger.EvtAudienceRejected, $"audience POST rejected: code={code} from={ctx.Request.RemoteEndPoint?.Address}"); await SendJson(ctx, 400, new { err = msg, code }); return; }
                await SendJson(ctx, 202, new { ok = true, size = _state.Audience.Size });
                return;
            }

            if (path == "/api/hud/sight/push")
            {
                if (method != "POST") { await SendJson(ctx, 405, new { err = "method_not_allowed" }); return; }
                if (!IsLoopback(ctx)) { await SendJson(ctx, 403, new { err = "loopback-only" }); return; }
                if (ctx.Request.Headers["x-uni-cc"] != "1") { await SendJson(ctx, 403, new { err = "x-uni-cc-header-required" }); return; }
                if (!(ctx.Request.ContentType?.StartsWith("application/json", StringComparison.OrdinalIgnoreCase) ?? false))
                { await SendJson(ctx, 415, new { err = "content-type must be application/json" }); return; }
                var body = await ReadBody(ctx.Request, 128 * 1024);
                if (body == null) { await SendJson(ctx, 413, new { err = "payload-too-large" }); return; }
                JsonElement obj;
                try { obj = JsonSerializer.Deserialize<JsonElement>(body); }
                catch { await SendJson(ctx, 400, new { err = "bad-json" }); return; }
                if (!obj.TryGetProperty("findings", out var f) || f.ValueKind != JsonValueKind.Array)
                { await SendJson(ctx, 400, new { err = "expected {findings:[…]}" }); return; }
                var pushedFrom = obj.TryGetProperty("pushed_from", out var pf) && pf.ValueKind == JsonValueKind.String ? pf.GetString() ?? "unknown" : "unknown";
                var clean = new List<SightFinding>();
                var dropped = 0;
                foreach (var el in f.EnumerateArray())
                {
                    var code = PollWorker.TryStr(el, "code");
                    var sev = PollWorker.TryStr(el, "severity");
                    if (string.IsNullOrEmpty(code) || code!.Length > 80) { dropped++; continue; }
                    if (sev != "bad" && sev != "warn" && sev != "info") { dropped++; continue; }
                    clean.Add(new SightFinding(
                        code: "user." + System.Text.RegularExpressions.Regex.Replace(code, @"[^\w.\-]", "_"),
                        severity: sev!,
                        title: (PollWorker.TryStr(el, "title") ?? "").Substring(0, Math.Min(200, (PollWorker.TryStr(el, "title") ?? "").Length)),
                        detail: (PollWorker.TryStr(el, "detail") ?? "").Substring(0, Math.Min(500, (PollWorker.TryStr(el, "detail") ?? "").Length)),
                        source: (PollWorker.TryStr(el, "source") ?? pushedFrom).Substring(0, Math.Min(200, (PollWorker.TryStr(el, "source") ?? pushedFrom).Length)),
                        since_ms: 0,
                        pushed_from: pushedFrom));
                }
                _state.UserSightFindings = clean;
                _state.UserSightLastPushAt = DateTime.UtcNow;
                _state.UserSightLastPushFrom = pushedFrom;
                await SendJson(ctx, 202, new { ok = true, accepted = clean.Count, dropped });
                return;
            }

            if (method == "GET") { await SendJson(ctx, 404, new { err = "not_found", path }); return; }
            await SendJson(ctx, 405, new { err = "method_not_allowed", method, note = "UNI-HUD is GET-only except audience/publish + sight/push" });
        }
        catch (Exception e)
        {
            _logger.LogError(e, "handler crashed");
            try { await SendJson(ctx, 500, new { err = "handler-crashed", detail = e.Message }); } catch { }
        }
    }

    private static bool IsLoopback(HttpListenerContext ctx)
    {
        var addr = ctx.Request.RemoteEndPoint?.Address;
        return addr != null && (System.Net.IPAddress.IsLoopback(addr));
    }

    private static async Task<byte[]?> ReadBody(HttpListenerRequest req, int limit)
    {
        using var ms = new MemoryStream();
        var buf = new byte[8192];
        int n;
        while ((n = await req.InputStream.ReadAsync(buf, 0, buf.Length)) > 0)
        {
            if (ms.Length + n > limit) return null;
            ms.Write(buf, 0, n);
        }
        return ms.ToArray();
    }

    private static async Task SendJson(HttpListenerContext ctx, int code, object body)
    {
        ctx.Response.StatusCode = code;
        ctx.Response.ContentType = "application/json; charset=utf-8";
        var s = JsonSerializer.Serialize(body, new JsonSerializerOptions { WriteIndented = false });
        var bytes = Encoding.UTF8.GetBytes(s);
        ctx.Response.ContentLength64 = bytes.Length;
        await ctx.Response.OutputStream.WriteAsync(bytes);
        ctx.Response.OutputStream.Close();
    }

    private object Envelope(object? result) => new
    {
        schema_version = 1,
        envelope = new
        {
            server = "uni-hud",
            instrument = "UNI.Hud.Service@0.2",
            git_commit = _state.GitCommit,
            module_version_id = _state.ModuleVersionId,
            timestamp = DateTime.UtcNow.ToString("O"),
        },
        result,
    };
}
