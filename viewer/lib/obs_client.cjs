// obs_client.cjs -- shared obs-websocket v5 client for the UNI studio.
//
// One class replaces the near-identical inline clients that used to live in
// command_center.cjs, studio.cjs, studio_stage.cjs, publisher-side probes, etc.
// The contract is the SAME shape as those inline clients (Promise<{ok, comment, data}>
// from req()), plus:
//   1. per-request timeout          (a stuck OBS request no longer hangs forever)
//   2. op:5 event dispatch          (subscribers can react to CurrentProgramSceneChanged,
//                                    InputMuteStateChanged, InputVolumeMeters, etc.)
//   3. Re-Identify on reconnect     (the subscription bitmask does not silently vanish
//                                    when the socket drops and the client comes back)
//
// Contract:
//   const client = new OBSClient({
//     url: "ws://127.0.0.1:4455",   // default
//     subscriptions: SUB.All | SUB.InputVolumeMeters,  // undefined = obs-ws default (All)
//     prefix: "cc",                 // request-id prefix (helps in logs)
//     onConnected: async () => {},  // called after op:2 Identified (and every reconnect)
//     onDisconnected: () => {},     // optional
//     reconnectMs: 3000,
//   });
//   client.connect();
//   client.connected           // bool
//   await client.req("GetStreamStatus")                // -> {ok, comment, data}
//   await client.req("Foo", {x:1}, 8000)               // 8 s timeout
//   const off = client.on("CurrentProgramSceneChanged", (d) => {...});
//   off();                     // unsubscribe
//
// Reconnect behavior:
//   * every pending req() resolves { ok:false, comment:"obs disconnected" }
//     -- matches the existing inline-client contract (no rejects)
//   * on next successful Identified, onConnected() fires again with the SAME
//     subscription bitmask automatically applied

const WebSocket = require("ws");

// obs-websocket v5 EventSubscription bits. From the protocol spec:
//   https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
// Low-volume categories 0..10 are ORed into `All` (2047). Verbose bits 16..19 must be
// added explicitly (they are excluded from the default subscription).
const SUB = Object.freeze({
  None:                        0,
  General:                     1 << 0,   //     1
  Config:                      1 << 1,   //     2
  Scenes:                      1 << 2,   //     4
  Inputs:                      1 << 3,   //     8
  Transitions:                 1 << 4,   //    16
  Filters:                     1 << 5,   //    32
  Outputs:                     1 << 6,   //    64
  SceneItems:                  1 << 7,   //   128
  MediaInputs:                 1 << 8,   //   256
  Vendors:                     1 << 9,   //   512
  Ui:                          1 << 10,  //  1024
  All:                         (1 << 11) - 1,   // 2047 -- all low-volume categories
  InputVolumeMeters:           1 << 16,  // 65536
  InputActiveStateChanged:     1 << 17,
  InputShowStateChanged:       1 << 18,
  SceneItemTransformChanged:   1 << 19,
});

class OBSClient {
  constructor(opts = {}) {
    this.url            = opts.url            || "ws://127.0.0.1:4455";
    this.subscriptions  = opts.subscriptions;                          // undefined => obs-ws All-default
    this.prefix         = opts.prefix         || "r";
    this.onConnected    = opts.onConnected    || null;                 // async fn()
    this.onDisconnected = opts.onDisconnected || null;                 // fn()
    this.reconnectMs    = opts.reconnectMs    || 3000;

    this.ws        = null;
    this.connected = false;
    this.rid       = 0;
    this.pending   = new Map(); // requestId -> { resolve, timer }
    this.handlers  = new Map(); // eventType -> Set<fn>
  }

  connect() {
    const w = new WebSocket(this.url);
    this.ws = w;

    w.on("message", (raw) => {
      let m;
      try { m = JSON.parse(raw.toString()); } catch (_) { return; }

      if (m.op === 0) {
        // Hello -> Identify (same op even on reconnect; subs bitmask is re-sent implicitly)
        const d = { rpcVersion: 1 };
        if (this.subscriptions !== undefined) d.eventSubscriptions = this.subscriptions;
        try { w.send(JSON.stringify({ op: 1, d })); } catch (_) {}
      } else if (m.op === 2) {
        // Identified
        this.connected = true;
        if (typeof this.onConnected === "function") {
          Promise.resolve().then(() => this.onConnected()).catch(() => {});
        }
      } else if (m.op === 5) {
        // Event
        const set = this.handlers.get(m.d.eventType);
        if (!set) return;
        for (const fn of set) { try { fn(m.d.eventData || {}, m.d); } catch (_) {} }
      } else if (m.op === 7) {
        // RequestResponse
        const p = this.pending.get(m.d.requestId);
        if (!p) return;
        this.pending.delete(m.d.requestId);
        clearTimeout(p.timer);
        p.resolve({
          ok:      !!m.d.requestStatus.result,
          comment: m.d.requestStatus.comment,
          data:    m.d.responseData || {},
        });
      }
    });

    const drop = () => {
      const was = this.connected;
      this.connected = false;
      // resolve every pending req() so callers unblock; do NOT reject (matches the
      // existing inline-client contract that command_center.cjs & studio.cjs use).
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.resolve({ ok: false, comment: "obs disconnected", data: {} });
      }
      this.pending.clear();
      if (was && typeof this.onDisconnected === "function") {
        try { this.onDisconnected(); } catch (_) {}
      }
      setTimeout(() => this.connect(), this.reconnectMs);
    };

    w.on("close", drop);
    // errors precede close; swallow here so we don't unhandled-reject.
    w.on("error", () => {});
  }

  req(type, data, timeoutMs) {
    if (timeoutMs === undefined) timeoutMs = 5000;
    return new Promise((resolve) => {
      if (!this.connected) return resolve({ ok: false, comment: "OBS not connected", data: {} });
      const id = this.prefix + (this.rid++);
      const timer = setTimeout(() => {
        // Timeout DOES NOT tear the socket down. Later op:7 for this id (if it eventually
        // arrives) will find nothing in `pending` and be silently ignored.
        if (this.pending.has(id)) {
          this.pending.delete(id);
          resolve({ ok: false, comment: "OBS request timed out", data: {} });
        }
      }, timeoutMs);
      this.pending.set(id, { resolve, timer });
      try {
        this.ws.send(JSON.stringify({ op: 6, d: { requestType: type, requestId: id, requestData: data || {} } }));
      } catch (e) {
        const p = this.pending.get(id);
        if (p) { clearTimeout(p.timer); this.pending.delete(id); }
        resolve({ ok: false, comment: "send failed: " + (e && e.message ? e.message : String(e)), data: {} });
      }
    });
  }

  on(eventType, handler) {
    if (!this.handlers.has(eventType)) this.handlers.set(eventType, new Set());
    this.handlers.get(eventType).add(handler);
    return () => {
      const set = this.handlers.get(eventType);
      if (set) set.delete(handler);
    };
  }
}

module.exports = { OBSClient, SUB };
