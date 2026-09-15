# Project re-initialization after the 2026-09 clean install

If the project root contains `PROJECT-FACTS.md`, the project was cleaned of the old agent
layer (old CLAUDE.md, AGENTS.md, hooks, skills, tdd-guard, serena, session debris) but has
not been re-initialized yet. Before any other work in that project, do exactly this, in this
order, and nothing else first:

1. Tell Nadav in one short Hebrew message that the project is waiting for re-initialization
   and that the three steps below must run in this session, in order.
2. Step 1: Nadav runs `/init`.
3. Step 2: Nadav runs `/oh-my-claudecode:deepinit`. It must not touch the root `AGENTS.md`
   symlink; if it wants to write one, keep `AGENTS.md` as a symlink to `CLAUDE.md`.
4. Step 3: Nadav pastes this prompt verbatim, and you carry it out:

   > Read PROJECT-FACTS.md and merge every fact that cannot be derived from the code into
   > CLAUDE.md under the MANUAL section, following these rules: plain English, no emoji and
   > no shouting, every rule carries a short why-clause, at most 120 lines and 12 KB,
   > STATUS.md and BACKLOG.md are referenced by path (never `@`-imported), no secret values,
   > path-scoped rules go into `.claude/rules/<topic>.md` with `paths:` frontmatter
   > (for example supabase, rtl-design, payments, mobile-appstore), AGENTS.md stays a
   > symlink to CLAUDE.md for Codex, keep any nextjs-agent-rules block verbatim at the
   > bottom, and do not repeat anything the global rules or plugins already cover.
   > Show me the resulting CLAUDE.md, then delete PROJECT-FACTS.md and commit.

5. After the commit, remind Nadav to run `/fewer-permission-prompts` once in this project and
   to open one fresh session to confirm only OMC, the global rules and the global plugins load.

Why: the three active projects (TherapyFlow, Green Room, SporChat) went through exactly this
flow on 2026-09-15 and 2026-09-16, and it produced CLAUDE.md files that are short, factual and
free of the old system. The marker file is the only state; once it is deleted the rule is inert.
