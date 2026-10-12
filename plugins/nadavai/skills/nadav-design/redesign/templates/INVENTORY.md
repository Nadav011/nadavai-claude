# Inventory · <App> today (<date>)

Every screen and every state of today's app, read from the code (routes, components, loading/error files, guards)
and checked against the running app. The demo and the plan are measured against this file: nothing listed here may
disappear from the demo unless an answer in DECISIONS-ANSWERED.md removes it.

**Source:** `<app path>` at commit `<git rev-parse HEAD>` (`origin/main` was `<git ls-remote origin main>` on <date>);
working tree clean: yes/no. Every row below describes that commit.
**Counts:** N screens · N states · N shared components · captured on <date> from <base url> as <QA account>.
The route table can start from `python3 -I tools/inventory-scan.py <app>` (grep-level leads); a screen's control list
comes from `--controls <route>` when the screen enters a lane.

| Screen id | Route | Today shot | States (each becomes a «מצב · …» phone) | Controls today (none may be lost) | Data shown | Notes |
|---|---|---|---|---|---|---|
| home | /home | today/home.png | ריק · טוען · שגיאה · אין חיבור | חיפוש, רשימה, … | | |

## Component variants (they may share «מצב» phones)
A component with several variants does not need a phone per variant: variants may share phones, and this table names
the phone that shows each one. The words verifier checks every row.

| Screen | Component | Variant | Shown in (column label) |
|---|---|---|---|

## Shared components today
| Component | File | Used by (screens) | Notes |
|---|---|---|---|

## Screens that could not be captured
Each row is also in redesign.json `today_missing` ({name: reason}) and its section labels the column
«היום · לא צולם · <reason>» (README step 2 lists the sources tried, in order).

| Screen | Sources tried | Why none worked | How the demo shows it instead |
|---|---|---|---|
