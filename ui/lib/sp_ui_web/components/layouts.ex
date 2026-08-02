defmodule SpUiWeb.Layouts do
  use SpUiWeb, :html

  def root(assigns) do
    ~H"""
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="csrf-token" content={Phoenix.Controller.get_csrf_token()} />
        <title>Stratified Palimpsest — Overlooker</title>
        <script defer src="/vendor/phoenix/phoenix.min.js"></script>
        <script defer src="/vendor/live_view/phoenix_live_view.min.js"></script>
        <script defer src="/assets/vendor/three/three.min.js"></script>
        <script defer src="/assets/vendor/three/OrbitControls.js"></script>
        <script defer src="/assets/world.js"></script>
        <script defer src="/assets/app.js"></script>
        <style>
          :root { color-scheme: dark; }
          * { box-sizing: border-box; }
          body { margin: 0; background: #0b0e14; color: #cdd6f4; font: 13px/1.4 ui-monospace, Menlo, Consolas, monospace; }
          header { padding: 10px 16px; background: #11151f; border-bottom: 1px solid #1f2430; display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
          header h1 { font-size: 15px; margin: 0; color: #89b4fa; letter-spacing: .5px; }
          .controls { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
          button, select, input { background: #1e2433; color: #cdd6f4; border: 1px solid #313a4e; border-radius: 4px; padding: 4px 8px; font: inherit; cursor: pointer; }
          button:hover { background: #2a3346; }
          .tick { color: #f9e2af; font-weight: bold; }
          main { display: grid; grid-template-columns: 1fr; gap: 12px; padding: 12px 16px; }
          .panel { background: #11151f; border: 1px solid #1f2430; border-radius: 6px; padding: 10px 12px; }
          .panel h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #94e2d5; margin: 0 0 8px; }
          .blanket { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
          /* one-screen dashboard: world view (left) beside the falsifiability evidence (right) */
          .dash { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(320px, 0.95fr); gap: 12px; align-items: start; }
          .stage-col { grid-column: 1; grid-row: 1; min-width: 0; max-height: calc(100vh - 116px); overflow: auto; }
          .evidence-col { grid-column: 2; grid-row: 1; min-width: 0; max-height: calc(100vh - 116px); overflow: auto; }
          .evidence-col .blanket { grid-template-columns: 1fr; gap: 8px; }
          .kid { color: #b8c0e0; font-size: 12.5px; line-height: 1.45; margin: 6px 0; }
          .evo { border: 1px solid #2d5a3d; border-radius: 6px; padding: 6px 9px; margin-bottom: 8px; background: #0e1b13; }
          .evo h3 { margin: 0 0 3px; font-size: 11px; text-transform: uppercase; letter-spacing: .6px; color: #a6e3a1; }
          .evo .kv { grid-template-columns: auto 1fr; margin-top: 4px; }
          .evo .kv b { color: #7f9c84; }
          @media (max-width: 1100px) { .dash { grid-template-columns: 1fr; } .stage-col, .evidence-col { grid-column: auto; grid-row: auto; max-height: none; } }
          /* tighten the evidence column so the verdict + 3 boxes fit one screen */
          .evidence-col h2 { margin: 0 0 6px; }
          .evidence-col .verdict { padding: 5px 9px; font-size: 12px; }
          .evidence-col .checks li { padding: 1px 0; font-size: 11px; }
          .evidence-col .kid { font-size: 11px; line-height: 1.35; margin: 3px 0; }
          .evidence-col .col { padding: 6px 8px; }
          .evidence-col .col h3 { margin: 0 0 3px; }
          .evidence-col .blanket { margin-top: 6px; }
          .evidence-col .obs { max-height: 88px; }
          .col { border: 1px solid #1f2430; border-radius: 6px; padding: 8px; background: #0e121b; }
          .col h3 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; color: #6c7393; }
          .world-col h3 { color: #f38ba8; } .body-col h3 { color: #fab387; } .agent-col h3 { color: #a6e3a1; }
          .verdict { padding: 6px 10px; border-radius: 5px; font-weight: bold; }
          .verdict.ok { background: #1c3a26; color: #a6e3a1; border: 1px solid #2d5a3d; }
          .verdict.leak { background: #4a1d28; color: #f38ba8; border: 1px solid #7a2d3d; }
          .checks { list-style: none; padding: 0; margin: 6px 0 0; }
          .checks li { padding: 2px 0; }
          .pass::before { content: "✓ "; color: #a6e3a1; } .fail::before { content: "✗ "; color: #f38ba8; }
          .kv { display: grid; grid-template-columns: auto 1fr; gap: 1px 8px; }
          .kv b { color: #7f849c; font-weight: normal; }
          .obs { display: flex; flex-wrap: wrap; gap: 3px; max-height: 160px; overflow: auto; }
          .chip { background: #1e2433; border: 1px solid #313a4e; border-radius: 3px; padding: 1px 5px; font-size: 11px; }
          .regions { display: flex; flex-direction: column; gap: 14px; }
          .region { border: 1px solid #1f2430; border-radius: 6px; padding: 8px; }
          .region > .rh { color: #89b4fa; margin-bottom: 6px; }
          .layers { display: flex; gap: 14px; flex-wrap: wrap; }
          .layer { text-align: center; }
          .layer .lab { font-size: 10px; color: #6c7393; margin-bottom: 3px; }
          .grid { display: grid; gap: 1px; }
          .cell { width: 14px; height: 14px; border-radius: 2px; }
          .cell.body { outline: 2px solid #f9e2af; outline-offset: -1px; }
          table.timeline { width: 100%; border-collapse: collapse; }
          table.timeline th, table.timeline td { text-align: left; padding: 2px 6px; border-bottom: 1px solid #1a1f2b; }
          table.timeline th { color: #6c7393; font-weight: normal; }
          .tag { border-radius: 3px; padding: 0 5px; font-size: 11px; }
          .tag.aff { background: #1c2f4a; color: #89b4fa; } .tag.eff { background: #3a2d1c; color: #fab387; }
          .gated-true { color: #a6e3a1; } .gated-false { color: #f38ba8; }
          .muted { color: #6c7393; }
          .vtoggle button.active { background: #3a4a6a; color: #f9e2af; border-color: #5a6a8a; }
          .deathbar { margin: 0; padding: 10px 16px; background: #4a1d28; color: #f38ba8; border-bottom: 1px solid #7a2d3d; font-weight: bold; letter-spacing: 1px; text-align: center; animation: deathpulse 0.7s ease-in-out infinite alternate; }
          @keyframes deathpulse { from { background: #4a1d28; } to { background: #6e2436; } }
          .horizonbar { margin: 0; padding: 10px 16px; background: #1c2f4a; color: #89b4fa; border-bottom: 1px solid #2d4a7a; font-weight: bold; letter-spacing: 1px; text-align: center; }
          .wmap { display: flex; gap: 30px; flex-wrap: wrap; align-items: flex-start; }
          .mregion { border: 1px solid #1f2430; border-radius: 8px; padding: 12px; background: #0c1018; }
          .mregion .rh { color: #89b4fa; margin-bottom: 8px; font-size: 12px; }
          .mgrid { display: grid; gap: 0; border: 2px solid #2a3142; border-radius: 4px; overflow: hidden; }
          .mcell { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; position: relative; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.22); }
          .mcell .struct { color: #0b0e14; background: #94e2d5; border-radius: 3px; width: 19px; height: 19px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; }
          .mcell .eco { width: 9px; height: 9px; border-radius: 50%; box-shadow: 0 0 2px rgba(0,0,0,0.6); }
          .mcell .trail { width: 8px; height: 8px; border-radius: 50%; background: #f9e2af; }
          .agent { width: 20px; height: 20px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #ffffff, #f9e2af 55%, #f5a742 100%); box-shadow: 0 0 9px 3px rgba(249,226,175,0.85); border: 1px solid #fff; }
          .mlegend { color: #6c7393; margin-top: 12px; line-height: 2.0; }
          .mlegend b { color: #cdd6f4; font-weight: normal; }
          .mlegend .sw { display: inline-block; width: 12px; height: 12px; border-radius: 2px; vertical-align: middle; margin: 0 3px 0 8px; }
          .world-wrap { position: relative; border: 1px solid #1f2430; border-radius: 8px; overflow: hidden; background: #05070b; }
          #world-canvas { width: 100%; height: calc(100vh - 215px); min-height: 320px; display: block; }
          .mc-cam { display: flex; gap: 6px; align-items: center; margin-bottom: 8px; }
          .mc-wrap { position: relative; border: 1px solid #1f2430; border-radius: 8px; overflow: hidden; background: #05070b; }
          .mc-frame { width: 100%; height: calc(100vh - 255px); min-height: 300px; border: 0; display: block; }
          .world-controls { position: absolute; top: 10px; right: 10px; display: flex; gap: 6px; flex-wrap: wrap; }
          .world-controls button { background: rgba(30,36,51,0.85); }
          .world-controls button.active { background: #3a4a6a; color: #f9e2af; border-color: #5a6a8a; }
        </style>
      </head>
      <body>
        {@inner_content}
      </body>
    </html>
    """
  end
end
