// BuildIdentityTests.cs — the HUD's boot-time build identity (Phase 9, step 1.1).
//
// The HUD is one of four bodies that must report the bytes it is actually running, so a healthy-but-stale
// process cannot hide. The .NET identity is the assembly MVID. These tests pin that it is present, well-formed,
// stable, and — the teeth — that it is genuinely the running assembly's MVID and not a fabricated constant.

using System.Reflection;
using UNI.Hud.Service;

namespace UNI.Hud.Service.Tests;

public class BuildIdentityTests
{
    [Fact] // the MVID is a 32-hex GUID, not empty and not the all-zero (unstamped) GUID
    public void ModuleVersionId_IsAWellFormedNonEmptyGuid()
    {
        var mvid = BuildIdentity.ModuleVersionId;
        Assert.Matches("^[0-9a-f]{32}$", mvid);
        Assert.NotEqual(Guid.Empty.ToString("N"), mvid);
    }

    [Fact] // frozen: it is served verbatim, identical across reads
    public void ModuleVersionId_IsStableAcrossReads()
    {
        Assert.Equal(BuildIdentity.ModuleVersionId, BuildIdentity.ModuleVersionId);
    }

    [Fact] // TEETH (M2): it is the MVID of the ACTUAL Service assembly, recomputed here independently.
    public void ModuleVersionId_IsTheRunningServiceAssemblysMvid()
    {
        var serviceAssembly = typeof(HudState).Assembly; // the assembly under test, not this test assembly
        var expected = serviceAssembly.ManifestModule.ModuleVersionId.ToString("N");
        Assert.Equal(expected, BuildIdentity.ModuleVersionId);
    }
}
