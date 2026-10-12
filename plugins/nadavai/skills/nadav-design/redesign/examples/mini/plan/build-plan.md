# Build plan · רצים (fixture)

**Status:** fixture for `tools/check-anchors.py`; this copy must pass (exit 0).

| Unit | What | Files | Demo | Acceptance | Size | Depends |
|---|---|---|---|---|---|---|
| U-1 | Upcoming runs, with the next run first | `src/app/home/page.tsx` | `s-home` «אחרי · הריצות הקרובות» and the 2 «מצב ·» labels («מצב · אין ריצות…», «מצב · טוען») | the next run carries the one primary action | S | — |
| U-2 | Profile with the week in numbers; the weekly summary after the core | `src/app/profile/page.tsx` | `s-profile` «אחרי · הפרופיל שלי», «מצב · שגיאה…» and «מוצע · 11.10 · אחרי הליבה · סיכום שבועי» | two numbers, error keeps the runs | S | U-1 |

## Round 1 changes
- U-1 used to cite «אחרי · רשימת הריצות», a label that was renamed; change logs are not checked.
