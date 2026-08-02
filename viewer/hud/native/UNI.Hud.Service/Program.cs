// UNI.Hud.Service — real Windows Service using ServiceBase (via
// Microsoft.Extensions.Hosting.WindowsServices). NOT NSSM-wrapped.
// This process IS a service: implements the SCM control handler protocol
// natively, responds to Start/Stop/PowerEvent, runs headless in Session 0.
//
// The HUD you SEE lives in UNI.Hud.Widget (WPF, user session). This service
// exposes JSON only — never HTML.

using UNI.Hud.Service;

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(o => o.ServiceName = "UNI-HUD");
builder.Services.AddSingleton<HudState>();
builder.Services.AddSingleton<EventLogger>();
builder.Services.AddHostedService<HttpApiHost>();
builder.Services.AddHostedService<PollWorker>();

var host = builder.Build();
await host.RunAsync();
