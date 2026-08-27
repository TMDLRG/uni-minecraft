const __obsauth = require("./lib/obs_auth.cjs");
// radio_refresh.cjs -- force OBS's ShowRadio ffmpeg_source to DROP its stale/half-open socket to
// cpradio and open a FRESH one. This is the documented fix (RADIO_AND_TELEMETRY_DEPLOY_2026-07-18.md
// "MANDATORY FOLLOW-UP after ANY cpradio restart"): after a reconnect, OBS can sit on a half-open
// socket that silently produces nothing while reporting PLAYING -- silence on the bed and empty
// now-playing telemetry. Clearing input to "" then restoring the URL after 3s forces ffmpeg to drop
// the socket and reconnect, which re-registers the listener with cpradio so audio + telemetry return.
// There is ONE radio (cpradio :8687); this only ever refreshes the real bed. It NEVER touches the
// fallback.
// Resolve the chip by NAME, never a transient IP literal. Its LAN address is a DHCP lease and the
// estate has been bitten by pinning it before (studio_up.ps1's own banner: "the chip LAN IP is a
// transient uplink; resolve uni-lab-lan.uni-lab.local, never a literal"). Same pattern as
// command_center.cjs:63,70 · door_healer.cjs:35 · door_lifecycle.cjs:34 · launcher.cjs:50.
//
// This line carried the literal `10.190.245.121` from 2026-08-04 (892bd40) until 2026-08-05, and it
// was the SINGLE live literal failing the repo-wide ip-fence gate — a gate whose green had been
// EARNED with a four-mutation proof and then silently regressed. CI caught the regression at the
// exact commit (ip-fence PASS in run 30786766254 on 08-03, FAIL in run 30925586634 on 08-04) and
// nobody saw it, because the overall run conclusion had already read "failure" for six days for
// other reasons. A pipeline that is always red cannot report a new break. That is the whole cost.
const RADIO_HOST = process.env.RADIO_HOST || 'uni-lab-lan.uni-lab.local';
const URL = process.argv[2] || `http://${RADIO_HOST}:8687/radio?session=obs-studio-thinker`;
const ws = new WebSocket('ws://127.0.0.1:4455');
const send = (op, d) => ws.send(JSON.stringify({ op, d }));
const req = (requestType, requestData, requestId) => send(6, { requestType, requestData, requestId });
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.op === 0) send(1, __obsauth.identifyD(m.d));
  else if (m.op === 2) req('SetInputSettings', { inputName: 'ShowRadio', inputSettings: { input: '' }, overlay: true }, 'clear');
  else if (m.op === 7) {
    const id = m.d.requestId, ok = m.d.requestStatus && m.d.requestStatus.result;
    console.log(id + ' ok=' + ok);
    if (id === 'clear') setTimeout(() => req('SetInputSettings', { inputName: 'ShowRadio', inputSettings: { input: URL }, overlay: true }, 'restore'), 3000);
    else if (id === 'restore') { req('SetInputMute', { inputName: 'ShowRadio', inputMuted: false }, 'unmute'); }
    else if (id === 'unmute') { setTimeout(() => { try { ws.close(); } catch (_) {} process.exit(ok ? 0 : 1); }, 300); }
  }
});
ws.addEventListener('error', () => { console.error('WS_ERROR :4455'); process.exit(3); });
setTimeout(() => { console.error('TIMEOUT'); process.exit(4); }, 12000);
