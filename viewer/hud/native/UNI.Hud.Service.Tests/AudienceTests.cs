// AudienceTests.cs — regression coverage for the bug the ultracode review
// caught: Audience.Accept was previously typed `dynamic` over a JsonElement,
// which cannot resolve members, so EVERY call threw and POST
// /api/hud/audience/publish silently rejected every request since the
// service was first written. Fixed to explicit JsonElement API; this test
// class exists specifically so that regression can never ship silently again.

using System.Text.Json;
using UNI.Hud.Service;
using Xunit;

namespace UNI.Hud.Service.Tests;

public class AudienceTests
{
    private static JsonElement Row(object obj) =>
        JsonSerializer.Deserialize<JsonElement>(JsonSerializer.Serialize(obj));

    private static object ValidRow(object? overrides = null)
    {
        var baseRow = new Dictionary<string, object?>
        {
            ["source"] = "yt",
            ["author"] = "Alice",
            ["text"] = "hello HUD",
            ["ts"] = 1700000000000L,
            ["sanitized_by"] = "test-vouch",
        };
        if (overrides is Dictionary<string, object?> o)
            foreach (var kv in o) baseRow[kv.Key] = kv.Value;
        return baseRow;
    }

    [Fact]
    public void Accept_ValidRow_Succeeds()
    {
        // This is THE regression test: before the fix, this call would return
        // ok=false, code="shape" for every input because `dynamic` on a
        // JsonElement threw RuntimeBinderException internally.
        var a = new Audience(200);
        var (ok, code, msg, row) = a.Accept(Row(ValidRow()));
        Assert.True(ok, $"expected acceptance, got code={code} msg={msg}");
        Assert.NotNull(row);
        Assert.Equal(1, a.Size);
    }

    [Fact]
    public void Accept_MissingSource_Rejects()
    {
        var a = new Audience(200);
        var overrides = new Dictionary<string, object?> { ["source"] = null };
        var input = ValidRow(overrides) as Dictionary<string, object?>;
        input!.Remove("source");
        var (ok, code, _, _) = a.Accept(Row(input));
        Assert.False(ok);
        Assert.Equal("source", code);
    }

    [Fact]
    public void Accept_MissingSanitizedBy_Rejects()
    {
        // The binding gate the whole endpoint exists to enforce: the HUD does
        // not sanitize itself, upstream must vouch. See hud-audience-sanitizer-honest gate.
        var a = new Audience(200);
        var input = ValidRow() as Dictionary<string, object?>;
        input!.Remove("sanitized_by");
        var (ok, code, _, _) = a.Accept(Row(input));
        Assert.False(ok);
        Assert.Equal("sanitized_by", code);
    }

    [Fact]
    public void Accept_EmptySanitizedBy_Rejects()
    {
        var a = new Audience(200);
        var input = ValidRow(new Dictionary<string, object?> { ["sanitized_by"] = "" });
        var (ok, code, _, _) = a.Accept(Row(input));
        Assert.False(ok);
        Assert.Equal("sanitized_by", code);
    }

    [Fact]
    public void Accept_OversizedUtf8Text_Rejects()
    {
        // Deliberately multi-byte characters (not just long ASCII) since the
        // check is UTF8.GetByteCount, not string.Length.
        var big = new string('★', 250); // each ★ is 3 UTF-8 bytes -> 750 bytes >> 200 cap
        var input = ValidRow(new Dictionary<string, object?> { ["text"] = big });
        var a = new Audience(200);
        var (ok, code, _, _) = a.Accept(Row(input));
        Assert.False(ok);
        Assert.Equal("text", code);
    }

    [Fact]
    public void Accept_NumericTs_Accepted()
    {
        var a = new Audience(200);
        var (ok, _, _, row) = a.Accept(Row(ValidRow(new Dictionary<string, object?> { ["ts"] = 1712345678901L })));
        Assert.True(ok);
        Assert.Equal(1712345678901L, row!.ts);
    }

    [Fact]
    public void Accept_Iso8601Ts_AcceptedAndConverted()
    {
        var a = new Audience(200);
        var (ok, _, _, row) = a.Accept(Row(ValidRow(new Dictionary<string, object?> { ["ts"] = "2026-07-14T20:00:00Z" })));
        Assert.True(ok);
        Assert.NotNull(row);
        Assert.True(row!.ts > 0);
    }

    [Fact]
    public void Accept_BadTsShape_Rejects()
    {
        var a = new Audience(200);
        var input = ValidRow(new Dictionary<string, object?> { ["ts"] = "not-a-date" });
        var (ok, code, _, _) = a.Accept(Row(input));
        Assert.False(ok);
        Assert.Equal("ts", code);
    }

    [Fact]
    public void Accept_StripsAngleBracketsFromStoredFields()
    {
        var a = new Audience(200);
        var input = ValidRow(new Dictionary<string, object?> { ["text"] = "hi <script>evil</script> bye" });
        var (ok, _, _, row) = a.Accept(Row(input));
        Assert.True(ok);
        Assert.DoesNotContain("<", row!.text);
        Assert.DoesNotContain(">", row.text);
    }

    [Fact]
    public void Accept_NonObjectInput_RejectsGracefully()
    {
        var a = new Audience(200);
        var (ok, code, _, _) = a.Accept(JsonSerializer.Deserialize<JsonElement>("\"just a string\""));
        Assert.False(ok);
    }

    [Fact]
    public void Recent_ReturnsNewestNInOrder()
    {
        var a = new Audience(200);
        for (int i = 0; i < 5; i++)
            a.Accept(Row(ValidRow(new Dictionary<string, object?> { ["author"] = $"A{i}" })));
        var recent = a.Recent(3);
        Assert.Equal(3, recent.Count);
        Assert.Equal("A2", recent[0].author);
        Assert.Equal("A4", recent[2].author);
    }

    [Fact]
    public void Cap_WrapsOldestRows()
    {
        var a = new Audience(3);
        for (int i = 0; i < 5; i++)
            a.Accept(Row(ValidRow(new Dictionary<string, object?> { ["author"] = $"A{i}" })));
        Assert.Equal(3, a.Size);
        var recent = a.Recent(3);
        Assert.Equal(new[] { "A2", "A3", "A4" }, recent.Select(r => r.author));
    }
}
