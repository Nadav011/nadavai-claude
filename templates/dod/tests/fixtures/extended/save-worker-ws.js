// The dedicated worker of save-worker-ws.html: a socket of its own, opened at load; a message on it,
// and a POST, when its page says forced colours switched on.
const ws = new WebSocket("ws://" + location.host + "/ws/worker");
self.onmessage = () => {
  try { ws.send("save-worker-ws"); } catch { /* closed */ }
  fetch("/save/worker-ws/fetch", { method: "POST", body: "x" }).catch(() => {});
};
