# Design layer setup (after the 2026-09 clean install)

Applies when the project root has a `package.json` that lists a UI framework (react, next,
vite, vue, svelte) and is missing `DESIGN.md` or `PRODUCT.md`. Those two files are the only
state: once both exist this rule is inert. Every old design-system and token document was
removed from all repos on 2026-09-16 (backups under
`~/Desktop/claude-backup-20260915/projects/<repo>/design/`) so that the new files are derived
from the code alone; never merge the old documents back in.

If `PROJECT-FACTS.md` also exists, finish `project-reinit.md` first (through its commit).

Then tell Nadav in one short Hebrew message that the design layer is pending and that he runs
`/ux-setup` (the `setup` mode of the nadav-design skill in the nadavai plugin). That skill is the
only home of the steps, commands and thresholds; this rule never restates them. Its templates
live in `~/nadavai/templates/`.

Never run `/impeccable craft`, `bolder` or `overdrive` on an existing app: they replace the
incumbent look and produce the generic "Impeccable look" instead of polishing the product's own.
