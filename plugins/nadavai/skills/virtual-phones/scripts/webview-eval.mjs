#!/usr/bin/env node
// Evaluates one JavaScript expression in the first page of a WebView whose DevTools socket was
// forwarded to a local port, and prints the value as JSON. Seen working for an app's WebView on a
// userdebug emulator image (google_apis); a retail-like image exposes no socket for a release app.
// The expression runs inside the app: use it to read (text, a field's value, navigator.onLine),
// never to call the app's backend or to change its state.
//
//   adb -s <serial> forward tcp:<port> localabstract:webview_devtools_remote_$(adb -s <serial> shell pidof <package>)
//   node webview-eval.mjs <port> "document.body.innerText"
const [port, expr] = process.argv.slice(2);
if (!port || !expr) {
  console.error('usage: webview-eval.mjs <port> "<js expression>"');
  process.exit(2);
}
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
const timer = setTimeout(() => fail('no answer from the WebView within 10 s'), 10_000);

let targets;
try {
  targets = await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(5_000) })).json();
} catch (error) {
  fail(`no DevTools socket on port ${port} (forward it again after every relaunch): ${error.message}`);
}
const page = targets.find((t) => t.type === 'page');
if (!page) fail('no page target on this socket');

const ws = new WebSocket(page.webSocketDebuggerUrl);
ws.onerror = () => fail('the DevTools WebSocket did not open');
ws.onopen = () =>
  ws.send(
    JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression: expr, returnByValue: true, awaitPromise: true },
    }),
  );
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id !== 1) return;
  clearTimeout(timer);
  console.log(JSON.stringify(d.result.result?.value ?? d.result, null, 1));
  ws.close();
};
