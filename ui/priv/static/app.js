// No-bundler LiveView client: uses the UMD globals exposed by the vendored
// phoenix.min.js (`Phoenix`), phoenix_live_view.min.js (`LiveView`), and the
// `World` 3D canvas hook defined by world.js (`window.World`).
(function () {
  const csrfToken = document
    .querySelector("meta[name='csrf-token']")
    .getAttribute("content");

  const liveSocket = new LiveView.LiveSocket("/live", Phoenix.Socket, {
    params: { _csrf_token: csrfToken },
    hooks: { World: window.World },
  });

  liveSocket.connect();
  window.liveSocket = liveSocket;
})();
