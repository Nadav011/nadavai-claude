---
paths:
  - "{app,components,src}/**"
---

# UI rules (installed by /ux-setup)

Read DESIGN.md and PRODUCT.md before any UI work. Tokens come only from {TOKENS}: no hex,
no arbitrary values, no new font or library without asking. Why: one source of truth keeps
every screen, Claude Design and the DoD gate on the same palette.

- Hebrew RTL-first: logical utilities only (`ms/me/ps/pe/start/end`, `text-start`), never
  `ml/mr/pl/pr/left/right`. eslint-plugin-tailwind-rtl enforces it; anything inside a
  `dir="ltr"` island stays physical on purpose.
- LTR islands: numbers, phone numbers, emails, URLs, code and Latin brand names render inside
  `dir="ltr"` or `<bdi>`. Dates, numbers and currency go through `lib/format` (Intl, he-IL),
  never hand-formatted.
- Directional icons (arrow, chevron, back, next, send) get `rtl:-scale-x-100`; symmetric icons
  do not.
- Every list, table and fetch has four states: loading (skeleton), empty (`EmptyState` with one
  action), error (`ErrorState` with retry), success. Never an empty div.
- Copy: real Hebrew in the voice PRODUCT.md defines (form of address, glossary). Where the
  reader's gender is unknown use neutral phrasing (infinitive or plural), never a slash form.
  No placeholder or machine-translated strings.
- Forms: react-hook-form + zod with the Hebrew locale (`z.config(z.locales.he())`); the error
  sits under its field, focus moves to the first invalid field, submit shows a pending state.
- Feedback: one `<Toaster dir="rtl">` (sonner) at the root; toasts confirm outcomes, dialogs
  confirm destructive actions.
- Touch and motion: targets >= 44px; `dvh` not `vh`; the shell respects safe-area insets;
  every animation stops under `prefers-reduced-motion`; no `transition: all`.
- Accessibility: visible focus ring from the token; a label on every input; buttons are
  `<button>`; images carry `alt` or `alt=""`; colour is never the only signal.
- User-supplied content (names, notes, messages, reviews, uploads) is rendered defensively, because it arrives in any script and any length: wrap it in `<bdi>` or a `dir="auto"` element so one Hebrew line beside a Latin one does not reorder the row; strip bidi control characters (U+202A-U+202E, U+2066-U+2069) on input; `overflow-wrap: anywhere` and a line clamp so a long word or URL cannot widen the layout; links inside it get `rel="nofollow ugc noopener"` and open with the same rules as any other link; images render at a fixed aspect box with `alt` from the uploader or `alt=""`, never at their natural size. Every surface that accepts content also has: a character counter before the limit, an upload progress and failure state, a report or delete action for the author, and an empty state that invites the first contribution rather than apologising.
- Components come from shadcn (`{PM_DLX} shadcn@latest add <name>`); do not hand-write one
  shadcn already has.
- A screen is done when `{PM} dod` scores 100 on its route, screenshots at 375 and 1440 in
  light and dark look right, and the console is clean.
