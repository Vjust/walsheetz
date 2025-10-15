# Walrus Metadata Indexing ADR

## Status

Accepted — production implementation in progress (October 2025)

## Context

Walrus stores spreadsheet payloads as immutable blobs that expire after a purchased
epoch range. Today WalSheetz persists the blob id and version metadata only via the
browser session and optional Sui registry writes. We need a durable, queriable index
so users can:

- Discover spreadsheets they already purchased (Walrus blob ids)
- Inspect Walrus chunk entitlements (epochs purchased, expiry dates, renewal options)
- Decide when to renew storage before data expiry
- Filter datasets by owner, tags, timestamps, access policy

Constraints:

- Walrus is immutable object storage; no native query interface beyond tag search
- Sui writes cost gas and require user consent; we want to defer commits until the
  user explicitly approves a blockchain transaction
- Users may operate partially offline; local-only indexes should not be the source of truth
- Expiration reminders must warn users *before* the Walrus epoch range lapses

## Decision

Implement a hybrid indexing layer anchored on Sui for global discovery, with an
off-chain service providing query acceleration and renewal orchestration. The
frontend and bridge will:

1. **Walrus blob schema** — include chunk metadata in every payload (epochs purchased,
   expiry timestamp, renewal history, proof parameters).
2. **Sui index objects** — each published version writes a compact record to the
   registry: owner, spreadsheetId, walrusBlobId, contentHash, epochRange,
   chunkRenewalStatus, lastCommitTimestamp, optional tags. Writes only happen when the
   user accepts the five-minute save prompt or clicks “Save Now”.
3. **Off-chain index API** — new service (bridge extension) hydrates Sui events and
   Walrus tag queries into a materialized view for fast lookups
   `querySpreadsheets({ owner, tags, limit, renewalState })`. It stores only public
   metadata (no cell data) and synchronizes via Sui event streams plus Walrus HEAD
   checks.
4. **Client cache** — IndexedDB caches recent query results + blob metadata for offline
   browsing. Treated as read-through cache; stale entries refresh on reconnect.

## Alternatives Considered

### A. Pure on-chain indexing (Sui tables only)
- **Pros:** Fully decentralized, no extra infra.
- **Cons:** High gas cost per edit; limits query expressiveness; heavy schema
  migration burden. Difficult to store full renewal schedules or chunk history.

### B. Walrus-only indexing (no Sui)
- **Pros:** No gas, minimal infra.
- **Cons:** Loss of decentralized discoverability; difficult to coordinate multi-user
  access; renewal reminders rely on centralized service. Reject.

### C. Client-side IndexedDB only
- **Pros:** Zero server dependency, offline-first.
- **Cons:** Each browser sees only what it has loaded before; no shared discovery;
  prevents collaboration scenarios. Reject.

## Consequences

- **Five-minute save prompt** — engine continues auto-saving to Walrus, but Sui commit
  requests fire only when the user accepts the periodic modal (or manual save). The
  prompt includes cost estimates and the chunk expiry countdown.
- **Renewal flow** — UI surfaces a timeline for each Walrus chunk. When expiry is
  within user-selected thresholds (e.g., < 7 days), we prompt to renew epochs and
  warn if a dataset is at risk.
- **Index uptime** — off-chain service must be monitored; fallback to direct Sui
  queries if unavailable. When offline, the frontend still shows locally cached
  datasets but flags them as stale.
- **Security** — no private cell data stored off-chain; only metadata required for
  discovery and renewal operations.

## Implementation Plan (summary)

1. Extend Walrus encoding schema with chunk metadata and renewal receipts.
2. Build bridge-side ingestion job tracking Sui events + Walrus blob metadata.
3. Expose REST endpoints `/index/spreadsheets`, `/index/spreadsheets/:id`,
   `/index/renewals` consumed by browser adapter.
4. Update frontend adapters/hooks to use new query contract and surface renewal UX.
5. Document configuration (epochs defaults, renewal thresholds) and operational
   runbooks.

## Testing Strategy

- Unit tests for schema validation utilities and chunk expiry calculations.
- Integration tests (bridge) asserting Sui + Walrus ingestion pipeline produces
  accurate index rows.
- End-to-end tests covering: save prompt acceptance, Sui commit, renewal reminder
  display, and dataset browsing.

## Open Questions

- Multi-tenant off-chain index deployment: shared service vs per-tenant?
- Renewal payments UX (auto-calculating Walrus fees vs user-specified epochs).
- Future decentralization path: migrating index tables fully on-chain once cost
  constraints loosen.


