# App-like probe (Orca saving state): append 4 KB and fsync every 50 ms for N seconds, then print
# latency percentiles in ms. The file must not exist yet; the probe creates it and removes only it.
# usage: python3 -I fsync-probe.py <new file path> <seconds>
import os, sys, time
path, dur = sys.argv[1], float(sys.argv[2])
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_APPEND, 0o600)
buf = os.urandom(4096); lat = []; end = time.time() + dur
try:
    while time.time() < end:
        t = time.perf_counter(); os.write(fd, buf); os.fsync(fd); lat.append((time.perf_counter() - t) * 1000); time.sleep(0.05)
finally:
    os.close(fd); os.unlink(path)
if not lat: sys.exit("probe: no samples")
lat.sort(); q = lambda p: lat[min(len(lat) - 1, int(len(lat) * p))]
print(f"probe n={len(lat)} p50={q(.5):.1f} p95={q(.95):.1f} p99={q(.99):.1f} max={lat[-1]:.0f} ms  over1s={sum(x > 1000 for x in lat)}")
