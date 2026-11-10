# A film driven by scroll

Reference for the `site` track. Written from the one implementation of Nadav's that was measured:
Camstore's home film (`apps/storefront/src/lib/film/` in the Camstore repo: `frame-store.ts`,
`mode.ts`, `player.ts`, `renderer.ts`, `timeline.ts`). Its audit of 7.11.2026
(`research/audit-1107/REPORT.md` in `camstore-media`) measured, on a desktop in Chromium, a
16.8 ms p99 frame time and no black frame at any of 104 stops; scrolling the whole film fetched
24 to 28 MB on a desktop and 12 MB on a phone. No third-party tool was found that does this
better; start from that code, not from a blank file.

## Two techniques, and when each fits

| | Frame sequence on a canvas | A video seeked by scroll |
|---|---|---|
| How | every frame is an image (WebP or AVIF); scroll position picks a frame; a canvas or WebGL quad draws it | `video.currentTime` follows scroll |
| Smoothness | exact frame for every position, both directions | a seek snaps to the nearest keyframe unless every frame is one |
| Bytes | larger; controllable per chapter | smaller; measure the encoded file, since every frame is a keyframe |
| Encoding | one image per frame, sized to the rendered width | `ffmpeg -i in.mp4 -an -g 1 -movflags +faststart -vf scale=<rendered width>:-2 out.mp4` (every frame a keyframe, no audio) |
| Use it for | a long film with chapters, HUD overlays tied to exact frames, scrubbing back | a short single shot |

CSS scroll-driven animations (`animation-timeline`) are the right tool for the overlays (HUD
lines, progress, type that follows scroll) where the browser has them: guard with
`@supports (animation-timeline: scroll())`, check support on the day, and keep the overlay
readable without it. They cannot move a video's time.

## What the frame store does, and why each part exists

- **Fetch a chapter at a time.** Nothing past a limit a little over one screen ahead of the
  visitor is fetched. A visitor who reads the opening and leaves pays for the opening only.
- **A sparse first pass.** Every eighth frame first, so a jump lands near the right moment at
  once and the frames between fill in behind it.
- **Each chapter's first picture early.** About 30 KB each on a phone: a jump to a chapter on a
  slow connection shows that chapter's own picture immediately.
- **Two forms in memory.** Compressed files stay once fetched. Decoded bitmaps (about 6 MB each)
  exist only in a window around the playhead, more ahead than behind; the rest are closed.
- **Decode off the main thread** with `createImageBitmap`, a small fixed number at a time, so a
  scrub never waits on a decode inside a frame. Fetches are capped too, and all of them abort
  when the film is left.
- **A poster behind it from first paint**, so there is never a black rectangle.

## Deciding film or still, per visitor

Still (the poster and a designed static page) when any of these holds: reduced motion is set,
save-data is on, the connection reports 2g, device memory is under 2 GB, the viewport is at most
420px high, or the browser lacks `createImageBitmap` (`mode.ts`). Camstore's wide 16:9 loops also
play only on a wide screen with a fine pointer (1100px and up); a phone or a tablet shows their
posters. The still version is a complete page, measured like any other (Camstore's, with reduced
motion on a desktop, weighed about 2.2 MB for the whole scroll).

## What to measure before calling it done

1. Frame time while scrubbing (p50, p99) and black frames, across stops through the whole film,
   forwards and backwards, and after a jump to each chapter.
2. Bytes fetched for: the opening only, the whole film, the still version. On a phone and a
   desktop profile.
3. First paint with the poster, and Lighthouse on the page as first loaded.
4. A slow connection (the first picture of each chapter appears on a jump; nothing arrives late
   over text).
5. The same on a real phone, not an emulator. Inside a Capacitor shell this is unverified: there
   is no primary source on scroll-scrubbed media in WKWebView, only reports of stutter.
6. Memory after scrubbing the whole film twice (the decode window must hold).

## What went wrong on the first one

- On a phone a department story opened on a black screen, because its poster was set only after
  it opened (audit A-30). The phone's hero video weighed 434 KB, about 40% of the first load,
  and showed as a dark strip 176px high (A-31). On slow 4G, 17 of 25 stops showed a different
  frame than a fast connection did after the same wait, with a headline over the wrong frame.
- The audit ran in Chromium only.
- The page budgets of the `awwwards` skill (a page under 3 MB, a video under 4 MB) cannot hold a
  film; they stay right for a site without one.
- The film came before the shop. See `tracks/site.md`, "The first real action first".
