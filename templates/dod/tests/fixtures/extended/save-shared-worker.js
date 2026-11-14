// The SharedWorker of save-in-shared-worker.html: saves when a page asks it to.
self.onconnect = (c) => {
  const port = c.ports[0];
  port.onmessage = (e) => fetch("/save?ev=shared-worker-" + e.data, { method: "POST", body: "x" });
};
