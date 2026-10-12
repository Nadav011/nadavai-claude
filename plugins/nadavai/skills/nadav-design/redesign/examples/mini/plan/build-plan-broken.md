# Build plan · רצים (fixture, deliberately broken)

**Status:** fixture for `tools/check-anchors.py`; this copy must FAIL (exit 1): U-1 cites a label the demo does not
have and states a count the section does not match.

| Unit | What | Files | Demo | Acceptance | Size | Depends |
|---|---|---|---|---|---|---|
| U-1 | Upcoming runs, with the next run first | `src/app/home/page.tsx` | `s-home` «אחרי · הריצות שלי» and the 3 «מצב ·» labels | the next run carries the one primary action | S | — |
| U-2 | Profile with the week in numbers; the weekly summary after the core | `src/app/profile/page.tsx` | `s-profile` «אחרי · הפרופיל שלי», «מצב · שגיאה…» and «מוצע · 11.10 · אחרי הליבה · סיכום שבועי» | two numbers, error keeps the runs | S | U-1 |
