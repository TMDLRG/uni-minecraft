// BuildIdentity.cs — the boot-time build identity of the HUD body (Phase 9, step 1.1).
//
// A long-lived body can be healthy yet running stale bytes. The Node bodies freeze a module_set_sha256 over
// their loaded require.cache; the Control Plane hashes the loaded BEAM bytecode. The .NET analogue is the
// assembly's MODULE VERSION ID (MVID) — a GUID the compiler stamps into the manifest module of every build.
// It is a property of the LOADED assembly, captured once and served verbatim, so a HUD process running a stale
// build serves an MVID that no longer matches the freshly-built assembly on disk. That is the ground-truth
// "which bytes am I" the old git_commit stamp (repo HEAD at boot) could never give.

using System.Reflection;

namespace UNI.Hud.Service;

public static class BuildIdentity
{
    // GetExecutingAssembly() is the Service assembly this code lives in. "N" = 32 lowercase hex, no braces.
    public static string ModuleVersionId { get; } =
        Assembly.GetExecutingAssembly().ManifestModule.ModuleVersionId.ToString("N");

    // The informational/assembly version, for humans; the MVID is the identity that actually distinguishes builds.
    public static string? AssemblyVersion { get; } =
        Assembly.GetExecutingAssembly().GetName().Version?.ToString();
}
