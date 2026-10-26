# Vendored third-party skills

Copied as-is from upstream (MIT), each folder keeps the upstream `LICENSE`. Selected on 2026-10-26 by the nadavc.ai skills research (`~/design-redesign/nadavc-ai/research/05-skills.md`), approved by Nadav. Local edits are limited to a short "nadavai preface" block after the frontmatter where noted.

| Skill folder(s) | Upstream | Commit | Local changes |
|---|---|---|---|
| gsap-core, gsap-timeline, gsap-scrolltrigger, gsap-react, gsap-performance, gsap-plugins | https://github.com/greensock/gsap-skills (`skills/`) | aed9cfd3277740755f6bfc1155c7aa645403b760 | RTL preface in gsap-scrolltrigger |
| awwwards | https://github.com/juliobsz/skills (`awwwards/`) | add880bd6ec9f5592a1482846fc0dd282c9161bc | RTL + DESIGN.md-ownership preface; `references/astro.md` removed (Next.js only); `tests/` and `jury/` not copied |
| threejs-react-three-fiber, threejs-shaders, threejs-postprocessing | https://github.com/CloudAI-X/threejs-skills (`skills/`) | 0e181866f095b5f06d005133876e926515390d95 | none |
| optimize-three | https://github.com/maxliebscher/optimize-three (`skills/optimize-three`) | 6d7557cf7ec1d4ce988984f863ae22db10436934 | `templates/start-chrome-dgpu.cmd` removed |

Update: re-clone upstream at a newer commit, re-copy the same paths, re-apply the prefaces, update this table.
