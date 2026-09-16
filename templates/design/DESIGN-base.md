<!-- Shared sections for every app's DESIGN.md (merged by /ux-setup step 6 under "Foundations").
     Structure only. The app's own DESIGN.md owns colors, font, radius personality, tone and imagery. -->

## Foundations (nadavai house base, from styles/base.css)

- **Type scale**: xs 12 / sm 14 / base 16 (line 1.6) / lg 18 / xl 20 / 2xl 24 / 3xl 30 / 4xl 36. Letter-spacing 0. Body text never below 16px on phones.
- **Spacing**: 4px scale only (`p-1` = 4px). Section gaps 24 or 32, card padding 16 or 24, form field gap 16.
- **Motion**: fast 120ms (hover, toggles), base 200ms (enter, menus), slow 320ms (sheets, page). Enter eases out, exit eases in. Nothing moves under `prefers-reduced-motion`. Never `transition: all`.
- **Layers**: sticky 10, drawer 40, modal 50, toast 60.
- **Touch**: every target 44px minimum; `touch-action: manipulation`; shell honours safe-area insets; heights in `dvh`.
- **Focus**: 2px ring from `--ring`, 2px offset, on `:focus-visible` only.
- **States**: every list, table and fetch has loading (skeleton), empty (one action), error (retry), success. Toasts confirm outcomes; dialogs confirm destructive actions.
- **RTL**: logical properties only; directional icons mirrored; numbers, phones, emails and Latin names in `dir="ltr"` islands.
