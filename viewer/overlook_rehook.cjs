const __obsauth = require("./lib/obs_auth.cjs");
// overlook_rehook.cjs -- re-hook a WGC window_capture that rolled BLACK (the documented WGC
// black-picture dice, CAM_ROBUST_MEDIA_SOURCE_2026-07-16.md). The captured window renders fine; OBS's
// Windows Graphics Capture just hooked it to a black frame. Toggling the capture METHOD forces OBS to
// release and re-acquire the capture, which re-rolls the hook -- almost always to a good capture the
// second time (cap_colony hooks fine; this just re-rolls the one that came up black). Reads the window
// string FROM OBS so the em-dash in the title is never retyped/mangled.
//   node viewer/overlook_rehook.cjs [inputName]   (default cap_overlook)
const NAME = process.argv[2] || 'cap_overlook';
const ws = new WebSocket('ws://127.0.0.1:4455');
const send = (op, d) => ws.send(JSON.stringify({ op, d }));
const req = (requestType, requestData, requestId) => send(6, { requestType, requestData, requestId });
let win = null, cursor = false;
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.op === 0) send(1, __obsauth.identifyD(m.d));
  else if (m.op === 2) req('GetInputSettings', { inputName: NAME }, 'get');
  else if (m.op === 7) {
    const id = m.d.requestId, ok = m.d.requestStatus && m.d.requestStatus.result;
    if (id === 'get') {
      win = m.d.responseData.inputSettings.window;
      cursor = !!m.d.responseData.inputSettings.cursor;
      console.log('window=' + win);
      // method 1 = BitBlt (releases the WGC hook)
      req('SetInputSettings', { inputName: NAME, inputSettings: { window: win, method: 1, cursor }, overlay: true }, 'bitblt');
    } else if (id === 'bitblt') {
      console.log('bitblt ok=' + ok);
      // back to method 2 = Windows Graphics Capture, fresh hook
      setTimeout(() => req('SetInputSettings', { inputName: NAME, inputSettings: { window: win, method: 2, cursor }, overlay: true }, 'wgc'), 1500);
    } else if (id === 'wgc') {
      console.log('wgc(rehook) ok=' + ok);
      setTimeout(() => { try { ws.close(); } catch (_) {} process.exit(ok ? 0 : 1); }, 400);
    }
  }
});
ws.addEventListener('error', () => { console.error('WS_ERROR :4455'); process.exit(3); });
setTimeout(() => { console.error('TIMEOUT'); process.exit(4); }, 12000);
