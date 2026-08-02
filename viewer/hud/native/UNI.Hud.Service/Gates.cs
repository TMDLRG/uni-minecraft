// Gates.cs — reads evidence/gates.ndjson from the repo directly.
// Same source-of-truth as the pre-.NET Node implementation.

using System.Text.Json;

namespace UNI.Hud.Service;

public static class Gates
{
    public static (List<GateRow> rows, string? err) Read()
    {
        try
        {
            var repoRoot = ResolveRepoRoot();
            var path = System.IO.Path.Combine(repoRoot, "evidence", "gates.ndjson");
            if (!System.IO.File.Exists(path)) return (new(), $"ENOENT: {path}");
            var latest = new Dictionary<string, GateRow>();
            foreach (var line in System.IO.File.ReadAllLines(path))
            {
                var t = line.Trim();
                if (t.Length == 0) continue;
                try
                {
                    var el = JsonSerializer.Deserialize<JsonElement>(t);
                    if (el.ValueKind != JsonValueKind.Object) continue;
                    if (!el.TryGetProperty("name", out var n) || n.ValueKind != JsonValueKind.String) continue;
                    if (!el.TryGetProperty("verdict", out var v) || v.ValueKind != JsonValueKind.String) continue;
                    latest[n.GetString()!] = new GateRow(
                        name: n.GetString()!,
                        verdict: v.GetString()!,
                        evidence_class: el.TryGetProperty("evidence_class", out var ec) && ec.ValueKind == JsonValueKind.String ? ec.GetString() : null,
                        phase: el.TryGetProperty("phase", out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null,
                        last_updated: el.TryGetProperty("last_updated", out var lu) && lu.ValueKind == JsonValueKind.String ? lu.GetString() : null,
                        receipt_path: el.TryGetProperty("receipt_path", out var rp) && rp.ValueKind == JsonValueKind.String ? rp.GetString() : null
                    );
                }
                catch { /* skip malformed row */ }
            }
            return (latest.Values.OrderBy(r => r.name).ToList(), null);
        }
        catch (Exception e) { return (new(), e.Message); }
    }

    public static string ResolveRepoRoot()
    {
        var envRoot = Environment.GetEnvironmentVariable("HUD_REPO_ROOT");
        if (!string.IsNullOrEmpty(envRoot) && System.IO.Directory.Exists(envRoot)) return envRoot;
        var cwd = Environment.CurrentDirectory;
        if (System.IO.File.Exists(System.IO.Path.Combine(cwd, "evidence", "gates.ndjson"))) return cwd;
        // Fallback: walk up from the exe until we find a "viewer" dir sibling to "evidence"
        var d = new System.IO.DirectoryInfo(AppContext.BaseDirectory);
        while (d != null)
        {
            if (System.IO.Directory.Exists(System.IO.Path.Combine(d.FullName, "evidence"))) return d.FullName;
            d = d.Parent;
        }
        return cwd;
    }
}
