# AI Assistant Guide: protos/

## Purpose
- Vendored Sui gRPC/Protobuf assets used by blockchain services and bridge diagnostics.

## Layout
- `sui/rpc/v2beta2/*.proto` are the canonical definitions loaded by gRPC clients (see `blockchain/sui-grpc-service.js`).
- Tarballs (`sui-grpc.tar.gz`, `sui.tar.gz`) preserve upstream snapshots for reproducible updates.
- `sui-main/` contains the upstream Sui repository snapshot for reference; treat it as read-only.
- The `protos/` subdirectory is reserved for generated artifacts when needed; keep generated code out of version control unless intentional.

## Update Process
- When upstream `.proto` files change, unpack a fresh snapshot into `sui/rpc/...` and update the tarball archives.
- Regenerate any derived clients or types by rerunning scripts that depend on these definitions (e.g. `scripts/test-simple-grpc.js`).
- Verify compatibility by running `bun run test:integration` and relevant bridge tests.

## Implementation Notes
- Avoid editing vendored `.proto` files inline; keep local changes small and well-commented if unavoidable.
- Document upstream source and revision when replacing snapshots.
- Vendored trees are large—scope searches (`rg`) to relevant folders to keep tooling responsive.

## Coordination
- Coordinate updates with `blockchain/` maintainers so service message schemas stay in sync.
- Update `docs/` with migration notes or compatibility concerns when gRPC APIs move.
