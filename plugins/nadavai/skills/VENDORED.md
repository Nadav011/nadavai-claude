# Vendored third-party skills

Copied as-is from upstream (MIT), each folder keeps the upstream `LICENSE`. Selected on 2026-10-26 by the nadavc.ai skills research (`~/design-redesign/nadavc-ai/research/05-skills.md`), approved by Nadav. Local edits are limited to a short "nadavai preface" block after the frontmatter where noted.

| Skill folder(s) | Upstream | Commit | Local changes |
|---|---|---|---|
| gsap-core, gsap-timeline, gsap-scrolltrigger, gsap-react, gsap-performance, gsap-plugins | https://github.com/greensock/gsap-skills (`skills/`) | aed9cfd3277740755f6bfc1155c7aa645403b760 | RTL preface in gsap-scrolltrigger |
| awwwards | https://github.com/juliobsz/skills (`awwwards/`) | add880bd6ec9f5592a1482846fc0dd282c9161bc | RTL + DESIGN.md-ownership preface; `references/astro.md` removed (Next.js only); `tests/` and `jury/` not copied |
| threejs-react-three-fiber, threejs-shaders, threejs-postprocessing | https://github.com/CloudAI-X/threejs-skills (`skills/`) | 0e181866f095b5f06d005133876e926515390d95 | none |
| optimize-three | https://github.com/maxliebscher/optimize-three (`skills/optimize-three`) | 6d7557cf7ec1d4ce988984f863ae22db10436934 | `templates/start-chrome-dgpu.cmd` removed |

## Capacitor skills (2026-11-10)

One owner per Capacitor topic (`~/.omc/plans/nadav-design-rebuild-v3-2026-11-10.md` §5.9). Each folder was scanned with `skillspector scan --no-llm` before copying (reports in `~/.omc/plans/agent-reports-2026-11-10/f-capacitor-scans/`). Local edits remove paid-service steering (Capawesome Cloud and Insiders licence setup, Capgo cloud), MCP install lines and OTA pointers; the OTA flow belongs to `store-apps`. Each folder carries the upstream root `LICENSE` (MIT).

| Skill folder(s) | Upstream | Commit | Local changes |
|---|---|---|---|
| capacitor-app-development, capacitor-plugins, capacitor-android-dex-optimization | https://github.com/capawesome-team/skills (`skills/`) | d7b8488f20481d09432c8e3c92be4b3fe6f9018b | capacitor-app-development: `references/ci-cd.md` removed (Capawesome Cloud steering; builds and CI belong to `store-apps` and ci-v2) with its topic-index row and the "CI/CD references" words in the description; `capawesome-cloud` and `capacitor-mcp` related-skill lines removed; paid Insiders plugins in `references/storage.md` and `references/security.md` marked paid. capacitor-plugins: "MCP Servers" section (two `claude mcp add` lines) removed; Step 1 no longer leads with Capawesome plugins; Step 4 Insiders licence-key setup replaced by a stop-and-ask-Nadav step; `capawesome-mcp` and `capacitor-mcp` related-skill lines removed; in 35 `references/capawesome-*.md` the npm registry and `_authToken <YOUR_LICENSE_KEY>` block is replaced by a paid-plugin note and the Insiders links are dropped; `references/capawesome-live-update.md` gets a nadavai preface (self-hosted OTA, owned by `store-apps`) and loses the Capawesome Cloud `appId`, `sync()` and forced-channel parts. capacitor-android-dex-optimization: `capawesome-cloud` related-skill line removed. The previous copies had no recorded commit; the R8 keep rule upstream now ships (`-keep @interface com.getcapacitor.** { *; }`) replaces the old `-keep class com.getcapacitor.** { *; }` |
| safe-area-handling | https://github.com/Cap-go/capacitor-skills (`skills/`) | e90bb5639130e34387f00bf0a95c6d47e4a2ebb8 | none; it replaces capacitor-app-development's `references/safe-area.md` and `references/edge-to-edge.md` (the plugin-specific parts of those live on in capacitor-plugins' `community-safe-area.md` and `capawesome-android-edge-to-edge-support.md`) |

Update: re-clone upstream at a newer commit, re-copy the same paths, re-apply the prefaces, update this table.
