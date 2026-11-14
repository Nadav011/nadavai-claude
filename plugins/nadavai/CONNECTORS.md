# Connectors

The product skills (write-spec, synthesize-research, competitive-brief, metrics-review) came from Anthropic's product plugin and
name tools by category with a `~~` placeholder. This is what each placeholder means in Nadav's
setup. When a category has nothing connected, ask Nadav for the material instead of guessing.

| Placeholder | Here |
|---|---|
| `~~project tracker` | GitHub Issues and PRs through `gh`. Linear only if its MCP is authenticated in the session. |
| `~~knowledge base` | The repo's own docs (README, PROJECT-FACTS, `planning/`, DESIGN.md, PRODUCT.md). Notion only if its MCP is authenticated. |
| `~~chat` | Slack only if its MCP is authenticated. WhatsApp through `wacli` is read-only unless Nadav asks for a send (`rules/whatsapp.md`). |
| `~~product analytics` | PostHog (the MCP server in `mcp.json`; setup in `guides/posthog-init.md`). |
| `~~user feedback` | PostHog surveys and session replays. Nothing else is connected. |
| `~~meeting transcription` | Nothing connected. Ask Nadav for the transcript or notes. |
| `~~design` | Code-first: the repo's DESIGN.md, tokens and screenshots. No Figma. |
