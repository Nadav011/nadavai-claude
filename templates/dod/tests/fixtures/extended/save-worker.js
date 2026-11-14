// The dedicated worker of save-in-worker.html: saves when its page asks it to.
self.onmessage = (e) => fetch("/save?ev=worker-" + e.data, { method: "POST", body: "x" }).catch(() => {});
