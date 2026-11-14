# Track `site`: a site that presents

A portfolio, a marketing or landing site, a showcase with a scroll film or 3D, the home of a
store. It is judged by how faithfully it follows the reference Nadav gave, by its motion, and by
how it behaves on a phone, not by the product-screen rules. Projects so far: nadavc.ai, Camstore's
home, the client demo sites.

A run is on this track when the thing being built presents rather than operates. The track is
declared in the first step of the mode and written in the run log. The moment a site has a shop,
a checkout or an account, those screens are product screens: they follow the app rules and the
experience standard (`standard/profiles.md`, consumer app), and only the presenting pages stay
here. «An app is built once» (`shared/rules.md`) does not cover the presenting pages, because the
page is the product; it covers those product screens.

## What changes from the app rules

| App rule | On this track |
|---|---|
| shadcn components only, tokens only | Tokens still hold. Custom sections, canvas and WebGL are expected; forms, dialogs and anything a person operates still come from shadcn. |
| Impeccable `craft`, `bolder`, `overdrive`, `delight` never | Still never on an existing site. On a new site, only when Nadav asks for it by name; the default is his reference, built faithfully. |
| The experience standard | Outside it, except states and errors of anything that loads or submits (T-01, T-02, E-01, E-04, E-05). |
| DoD on every route | Unchanged: every route, the mechanical checks, axe, console. |
| Lighthouse | Unchanged for the page as first loaded. Heavy media loads on demand after first paint and has its own budget below, so the bar is met, not waived. |
| Visual change gate | Unchanged. Tempo is usually `flow`: pairs collect to a checkpoint. |
| One Hebrew family, at most two families (setup step 3) | Body text keeps the project's Hebrew family. A display face the reference needs is a new font: asked once, with the licence checked and a free face proposed (a new font is Nadav's: `SKILL.md`, the font and dependency line and case 3 of the visual change gate). |
| Direction pick, three candidate themes (setup step 11b) | Not offered when he gave a reference: the reference is the direction. |

## The order of work

1. **His words.** The understanding check on the taste words he used for this site (a word
   such as "ambitious" or "advanced", or "like X"), with visible examples, before anything
   else. Read `REJECTED.md`.
2. **The reference.** `shared/reference.md`: deconstruct into `REFERENCE.md`, check the ledger
   (the coverage script, then a fresh reviewer), list the assets it needs, build the first row
   and show it, then row by row on one page.
3. **Content before effect.** Real copy, real photos and the real logo, or a row waits. A
   person-led hero needs a professional portrait.
4. **The first real action first.** On a phone, what the visitor came to do (enter the shop,
   contact, see the work) is reachable at once. A show never stands between the visitor and it:
   on Camstore's desktop the store sat at 91% of the page depth behind 26 screens of film (audit
   of 7.11.2026, A-02), and on a phone the scroll before the shop annoyed him. The film or the 3D is one tap away, or runs
   behind content that already works.
5. **Motion with its owners.** Load the skills before building: `gsap-core`,
   `gsap-scrolltrigger`, `gsap-timeline`, `gsap-react`, `gsap-performance` for scroll and
   timelines, and `gsap-plugins` when the page uses a GSAP plugin (SplitText, Flip, Draggable,
   ScrollSmoother, the SVG plugins); `animate` for interface motion; `vercel-react-view-transitions` for route changes;
   `threejs-react-three-fiber`, `threejs-shaders`, `threejs-postprocessing` with
   `optimize-three` for 3D (measure first, frame cap, GPU tiers); `awwwards` for the overall
   workflow, except its page and video budgets, which a scroll film replaces
   (`tracks/site-film.md`).
6. **A fresh critic on the assembled page** before he sees each row: differences from the
   reference by frame pair, and the mechanical probe.
7. **Phone on a real device.** An emulated phone is not evidence for scroll, video decode or
   WebGL. Android through adb; iOS by hand. Inside a Capacitor shell, scroll-scrubbed media is
   unverified territory (only forum reports of stutter on iOS): measure on the device before
   promising it.

## Budgets and floors

- **First load** meets the quality bar with the heavy media not yet fetched: a poster or still is
  in the first paint, and the page is complete and useful without the film.
- **Reduced motion, save-data, a slow connection, low device memory** get the still version, and
  it is a designed page, not a blank where the film was.
- **Moving content that starts by itself and runs longer than five seconds** has a visible
  pause (WCAG 2.2.2).
- **Everything a search engine or a screen reader needs is in the HTML**, not painted on a canvas.
- **A film** follows `tracks/site-film.md`: bytes fetched a chapter at a time, a bounded decode
  window, measured frame time.
- **3D:** models through a pipeline (glTF, Draco or Meshopt, KTX2 textures); WebGL2 by default;
  a frame cap and a fallback tier for weak GPUs (`optimize-three`).

## Generated media

Images and video made by a model are part of art direction here, and they cost money.
- **Cost before every paid call.** State the model, the price of this call and the running total;
  the money gate of `rules/acting-on-behalf.md` applies each time. Compare models on one sample
  before a batch.
- **Show an example before the batch.** One still or one clip, his answer, then the rest.
- **Only what exists.** A store's film shows only products the store sells; no brand logos
  inside generated footage; no generated face presented as a real person. Real type and real
  Hebrew are added in the edit, never generated.
- **Consistency:** key stills first, then image-to-video from those stills.
- Tools on this machine: ffmpeg (with fribidi and libass for Hebrew), Blender (headless
  `blender -b -P`), the project's own image script. Prices and model names change monthly: read
  the vendor page on the day, never quote them from memory.

## Before release

The SEO pass of `rules/working-style.md` ("Verification"), the DoD on every route, Lighthouse on
the first load, the still version checked, a real-phone pass, `decisions-open.py REFERENCE.md`
at 0 (or each open row listed to him), and the link checked with
`redesign/tools/early-show.sh`. A demo address is one of his own domains.

## Lessons this track encodes (each cost a round)

1. Three themed "worlds" in place of his portal-hero reference, shown only when finished: all
   rejected (nadavc.ai, 26.10.2026).
2. Isolated effect modules did not land; one cohesive page in order did.
3. Apple-style restraint offered for a camera store whose reference was a loud product reel:
   not even close, he said *(summary, 5.11)*.
4. A film first and the shop behind it: fixed for phones first, then desktop.
5. The film showed products the store does not sell, and a face that had to be replaced.
6. The audit ran in Chromium only: phone behaviour was still unknown when it was called done.
