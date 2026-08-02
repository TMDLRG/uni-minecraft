// HudClient.cs — thin HttpClient wrapper around the UNI-HUD service JSON API.
// Never returns null; on error returns a Snapshot with Reachable=false.

using System.Net.Http;
using System.Text.Json;

namespace UNI.Hud.Widget;

public sealed class HudClient
{
    private readonly HttpClient _http;
    private readonly string _base;

    public HudClient(string baseUrl = "http://127.0.0.1:8100")
    {
        _base = baseUrl.TrimEnd('/');
        _http = new HttpClient(new SocketsHttpHandler {
            PooledConnectionLifetime = TimeSpan.FromSeconds(10),
        }) { Timeout = TimeSpan.FromSeconds(3) };
    }

    public async Task<JsonElement?> GetAsync(string path, CancellationToken ct = default)
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, _base + path);
            req.Headers.ConnectionClose = true;
            using var resp = await _http.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode) return null;
            var raw = await resp.Content.ReadAsStringAsync(ct);
            return JsonSerializer.Deserialize<JsonElement>(raw);
        }
        catch { return null; }
    }
}
