# `rm` targets: literal or guarded

Every `rm` target is a literal path or starts with a guarded variable (`rm -rf "${T:?}"/*`); under `$HOME` or `~`, guard the part after it (`"$HOME/${rel:?}"`). agent-guard enforces this, and its deny text gives the rewrite. Claude Code's own removal check, which no permission mode skips, also holds the session on two things the guard cannot see:

- Test cases that contain `rm` text go into a scratchpad file run with `bash <file>`, not inline in quotes, and `rm` words stay out of commit messages (`git commit -F file`).
- File contents are written with the Write tool, not with a heredoc inside a Bash command that chains other commands (`&&`, `;`, lines after `EOF`); run the commands that use the file as separate calls.
