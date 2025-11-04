#!/bin/bash
# Create directory structure for migration
# Idempotent - safe to re-run

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

echo "Creating directory scaffolding for layered architecture..."

# Create Walrus directories
echo "  Creating src/walrus/..."
mkdir -p src/walrus/{client,config,health,retry,transports,utils}

# Create SDK directories
echo "  Creating src/sdk/..."
mkdir -p src/sdk/core/{queue,scheduling}
mkdir -p src/sdk/services/{blockchain,storage,formulas,testing}
mkdir -p src/sdk/adapters/{atomic,storage}
mkdir -p src/sdk/business/hooks
mkdir -p src/sdk/interfaces/graphql
mkdir -p src/sdk/types
mkdir -p src/sdk/utils

# Create CLI directories (for future)
echo "  Creating src/cli/..."
mkdir -p src/cli/commands

# Create Web UI directories
echo "  Creating web/..."
mkdir -p web/components/{layout,modals,cards,status,network,wallet,spreadsheet,collaboration,effects,debug}
mkdir -p web/pages
mkdir -p web/providers
mkdir -p web/hooks
mkdir -p web/services/{luckysheet,browser}
mkdir -p web/types
mkdir -p web/utils
mkdir -p web/styles/components
mkdir -p web/public

# Create blockchain subdirectories (reorganize existing)
echo "  Creating blockchain subdirectories..."
mkdir -p blockchain/{services,managers,registry,utils}

# Create migration temp directory
echo "  Creating migration temp directory..."
mkdir -p .migration-temp/legacy

# Create refactor reports directory (already exists from Phase 0)
mkdir -p scripts/refactor/{baseline,reports}

# Create .gitkeep files in empty directories
echo "  Creating .gitkeep files..."
find src web scripts/refactor .migration-temp -type d -empty -exec touch {}/.gitkeep \; 2>/dev/null || true

# Update .gitignore to include migration temp
echo "  Updating .gitignore..."
if ! grep -q "^\.migration-temp/" .gitignore 2>/dev/null; then
    echo "" >> .gitignore
    echo "# Migration temporary files" >> .gitignore
    echo ".migration-temp/" >> .gitignore
fi

echo ""
echo "✓ Directory scaffolding complete!"
echo ""
echo "Created structure:"
echo "  src/"
echo "    ├── walrus/          (Walrus storage client)"
echo "    ├── sdk/             (Core SDK and business logic)"
echo "    └── cli/             (CLI commands - future)"
echo "  web/                   (React web UI)"
echo "  blockchain/            (Server-side services)"
echo "  .migration-temp/       (Safe archive for legacy files)"
echo ""
