# Sui Reference Agents Guide

## Purpose
- Centralize navigation tips for the Sui reference bundle and Walrus documentation
- Help agents choose the right reference before searching the wider web

## Directory Map
- `Sui Ref/codefetch/`: Collected snippets and example integrations for Sui and Walrus
- `Sui Ref/walrus-docs/`: Walrus protocol specs, API descriptions, and troubleshooting notes
- `Sui Ref/move-book/`: Move language book; use for syntax, patterns, and best practices when reviewing or writing Move modules

## Usage Guidelines
- Prefer reading the relevant document here before looking elsewhere; these copies track the versions used by the project
- Use `read_file` with absolute paths (for example, `/Users/angel/Projects/test/walsheetz/Sui Ref/walrus-docs/...`) to avoid navigation issues
- Summaries are welcome, but keep citations to specific files and sections when referencing documentation in discussions or reviews
- Treat materials as reference-only: do not edit unless explicitly asked to update vendored docs

## Cross-Project Tips
- When investigating Move contracts (e.g., `move/sources/`), consult `move-book` for language semantics
- For Walrus bridge or storage questions, start in `walrus-docs` before reviewing source code in `blockchain/`
- If you need API schemas or RPC details referenced in Sui services, check `codefetch` for curated examples or existing requests
