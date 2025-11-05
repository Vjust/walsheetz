# WalSheetz AI Assistant Shared Guidelines

Concise reference for all automated contributors. Keep changes targeted and follow owners' area-specific `AGENTS.md` instructions before introducing new patterns.

---

## Purpose

Provide a single landing spot for shared expectations while pointing to authoritative docs already maintained elsewhere.

---

## Key References

- [Quickstart](./QUICKSTART.md) — automated setup and frequent commands
- [Configuration](./CONFIGURATION.md) — environment variables and secrets policy
- [Testing](./TESTING.md) — Vitest usage, coverage targets, environments
- [Frontend AGENT](../frontend/AGENTS.md) and [Blockchain AGENT](../blockchain/AGENTS.md) — domain-specific rules

---

## Core Principles

1. Prefer the smallest, safest change that fixes the root cause.
2. Match surrounding code style; never introduce new tooling without team approval.
3. Use Bun-first commands (`bun run ...`); fall back only when scripts require it.
4. Keep logs, credentials, and env-sensitive data out of source control.
5. Update or add tests whenever behavior changes; maintain ≥80% coverage on touched areas.

---

## Minimum Workflow Checklist

```bash
bun run setup      # env validation & dependency install
bun run dev:full   # bridge + frontend for manual verification
bun run test:all   # tests + lint + typecheck (adjust per request)
```

Add targeted package commands with `bun run --filter <workspace> <script>` when working inside `packages/*` or `apps/*`.

---

## Coding Notes

- JavaScript/TypeScript with ES modules, 2-space indent, single quotes, minimal inline comments.
- Import order: external deps → workspace aliases (`@`, `@blockchain`) → relative modules.
- Favor functional React patterns; avoid new state managers unless already adopted.
- Reuse `scripts/utils/logger.js` for CLI logging consistency.

---

## Security Snapshot

- Never commit secrets; configuration lives in `blockchain/config.js` or ignored `.env` files.
- Respect `BRIDGE_*` and Walrus publisher settings; expose new ports only after review.
- Verify dependencies already exist before adding new ones; document rationale when unavoidable.

---

## When In Doubt

Pause and consult the owning `AGENTS.md`, recent commits, or open issues. Ask for clarification rather than speculating—keeping the repo lean matters more than shipping new helpers.
