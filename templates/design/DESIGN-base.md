<!-- Shared section for every app's DESIGN.md (merged by /ux-setup step 6 under "Foundations").
     Rules only. The numbers live in base.css next to the token file and /impeccable document extracts
     them into the frontmatter; never retype a value here. The app's own DESIGN.md owns colors, font,
     radius personality, tone and imagery. -->

## Foundations (nadavai house base, from base.css)

- **Type**: use the scale's steps only (`text-xs` to `text-4xl`); letter-spacing 0; body text never below 16px on phones.
- **Spacing**: the 4px scale only; section gaps 24 or 32, card padding 16 or 24, form field gap 16.
- **Motion**: `duration-fast` for hover and toggles, `duration-base` for enter and menus, `duration-slow` for sheets and page transitions; `ease-enter` in, `ease-exit` out. Nothing moves under `prefers-reduced-motion`. Never `transition: all`.
- **Layers**: `z-sticky` < `z-drawer` < `z-modal` < `z-toast`; nothing else sets z-index.
- **Touch**: every target `--size-touch` (44px) minimum; `touch-action: manipulation`; the shell pads with `--safe-*`; heights in `dvh`.
- **Focus**: the ring comes from `--ring` on `:focus-visible` only.
- **States**: every list, table and fetch has loading (skeleton), empty (one action), error (retry), success. Toasts confirm outcomes; dialogs confirm destructive actions.
- **RTL**: logical properties only; directional icons mirrored; numbers, phones, emails and Latin names in `dir="ltr"` islands.
