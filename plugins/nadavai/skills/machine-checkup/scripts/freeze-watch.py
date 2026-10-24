# Samples every 100 ms for N seconds and prints one line per event:
#   APP   - the watched app's main thread (default: Orca's main process) stayed in D (waiting on disk) >= 300 ms,
#           with the kernel function it waited in; an event still open when the window ends is reported too.
#   LATE  - this sampler woke >= 300 ms late. Many LATE lines with low CPU PSI suggest a machine-wide
#           stall; a few are not proof (the sampler itself can be descheduled).
# usage: python3 -I freeze-watch.py <seconds> [process cmdline regex, default ^/opt/Orca/orca-ide$]
import sys, time, subprocess
dur = int(sys.argv[1]); pat = sys.argv[2] if len(sys.argv) > 2 else "^/opt/Orca/orca-ide$"
def find_pid():
    out = subprocess.run(["pgrep", "-of", pat], capture_output=True, text=True).stdout.split()
    return int(out[0]) if out else None
def state(pid):
    try:
        s = open(f"/proc/{pid}/stat").read(); return s[s.rindex(")") + 2], open(f"/proc/{pid}/wchan").read()
    except OSError: return None, ""
def psi(k): return open(f"/proc/pressure/{k}").read().split()[1]
pid = find_pid()
if pid is None: sys.exit(f"no process matches {pat}")
end = time.time() + dur; dstart = None; wch = ""; last = time.monotonic(); n_app = n_late = 0
def close_event(now, open_at_end=False):
    global n_app, dstart
    d = now - dstart
    if d >= 0.3:
        n_app += 1
        print(f"{time.strftime('%T')} APP main thread blocked {d*1000:.0f} ms in {wch}{' (still blocked at end)' if open_at_end else ''}  io {psi('io')}", flush=True)
    dstart = None
while time.time() < end:
    time.sleep(0.1); now = time.monotonic(); lag = now - last - 0.1; last = now
    if lag >= 0.3:
        n_late += 1; print(f"{time.strftime('%T')} LATE sampler woke {lag*1000:.0f} ms late  cpu {psi('cpu')} io {psi('io')}", flush=True)
    s, w = state(pid)
    if s is None:                      # the app restarted: close any open event and follow the new process
        if dstart is not None: close_event(now)
        pid = find_pid()
        if pid is None: print(f"{time.strftime('%T')} app process gone", flush=True); break
        continue
    if s == "D":
        if dstart is None: dstart, wch = now, w
    elif dstart is not None: close_event(now)
if dstart is not None: close_event(time.monotonic(), open_at_end=True)
print(f"summary: {n_app} app main-thread disk stalls >= 300 ms, {n_late} late sampler wake-ups >= 300 ms, in {dur} s")
