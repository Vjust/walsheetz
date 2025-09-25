# AI Assistant Guide: docs/

## Purpose
- Reference documentation, design notes, and runbooks for WalSheetz contributors.

## Layout
- Top-level markdown files capture feature guides (e.g. `TESTING.md`, rate limiting summaries).
- `dev/` holds development experiments such as alternate Vite configurations.
- Additional subfolders follow subject-specific organization; keep names descriptive and scoped.

## Contribution Guidelines
- Write concise markdown with ASCII characters; include context, decisions, and actionable steps.
- Update docs alongside code changes so troubleshooting guides stay accurate.
- Prefer linking back to source files (`frontend/...`, `blockchain/...`) to ground instructions.

## Workflow Tips
- When adding new features, document setup or operational changes here and reference them from `README.md` if user facing.
- For temporary experiments, note expiration or cleanup expectations at the top of the file.
- Store large media assets outside the repo and link to them instead of committing binaries.

## Coordination
- Keep doc references in AGENTS files and the README up to date.
- Call out dependencies on environment variables or scripts so agents can trace end-to-end flows.
