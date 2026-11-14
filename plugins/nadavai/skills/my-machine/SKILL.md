---
name: my-machine
description: "המחשב נתקע או מלא: מה מכביד עכשיו, מה בטוח לסגור ולמחוק, ובדיקה מלאה אם צריך."
argument-hint: "[מה קורה, ובאיזה מחשב]"
disable-model-invocation: true
---
# my-machine: the computer is stuck, slow, hot or full

Nadav's machine freezes, runs hot or has no disk space left, and the agents' own work is often the cause. He wants to know what loads it now, to have it relieved safely, and a full checkup when one is due.

What he sees, and on which machine: $ARGUMENTS

1. Measure now, on the machine he means: load, memory and swap, temperature, disk use per mount, and the heaviest processes with the session or service each one belongs to (`heavy-slot --status`, `machines-now`). Give each number in one line.
2. Sort what loads it: yours (started by this session), another session's, his own apps, the system. Stop only what is yours, by the pid or the port you know is yours, never by matching a command's text (`machine-load.md`). For another session's process, tell that session with SendMessage. For his own apps, tell him what closing each one would free; the desktop-control skill's line holds here too: his session and his apps are not restarted by an agent.
3. For a full disk, list what takes the space, the largest first, before anything is removed. Read the cleanup keep-list in memory (`grep -ril 'cleanup' ~/.claude/projects/*/memory/`), and leave active projects alone. Temporary, generated and cache files that can be made again are removed. A file that cannot be made again and has no verified backup is a deletion with no way back, one of the five gates (`working-style.md`, Approval gates): show him that list. Every `rm` follows `rm-safety.md`.
4. Report: what was loading it; what you stopped or removed and what that freed, with the numbers before and after; what is left and whose it is; and whether the cause was this setup's own work (too much side by side, a heavy job outside `heavy-slot`, a server left up).
5. When the trouble keeps coming back, or he asks for the full round (top performance, every tool updated, a complete inventory of the disk), invoke the Skill tool with skill `nadavai:machine-checkup` and follow it. That round takes hours: say so, and run its long parts in the background.
