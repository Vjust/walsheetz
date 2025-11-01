#!/bin/bash
# Scan repository and create inventory for migration
# Output: inventory.json with file mappings

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

OUTPUT_FILE="scripts/refactor/inventory.json"

echo "Scanning repository for migration inventory..."

# Helper function to get file size
get_size() {
    if [[ -f "$1" ]]; then
        stat -f%z "$1" 2>/dev/null || stat -c%s "$1" 2>/dev/null || echo "0"
    else
        echo "0"
    fi
}

# Helper function to extract imports from a JS/JSX file
extract_imports() {
    if [[ -f "$1" ]]; then
        grep -E "^import .* from ['\"]|^const .* = require\(['\"]" "$1" 2>/dev/null | \
            sed -E "s/.*from ['\"]([^'\"]+)['\"].*/\1/" | \
            sed -E "s/.*require\(['\"]([^'\"]+)['\"].*/\1/" || echo ""
    fi
}

# Start JSON
cat > "$OUTPUT_FILE" <<'JSON_START'
{
  "scan_date": "
JSON_START

date -u +"%Y-%m-%dT%H:%M:%SZ" >> "$OUTPUT_FILE"

cat >> "$OUTPUT_FILE" <<'JSON_CONTINUE'
",
  "walrus_files": [
JSON_CONTINUE

# Scan Walrus files
echo "  Scanning Walrus files..."
WALRUS_FIRST=true
find frontend/services/walrus -type f \( -name "*.js" -o -name "*.jsx" \) 2>/dev/null | while read -r file; do
    if [[ "$WALRUS_FIRST" != "true" ]]; then
        echo "," >> "$OUTPUT_FILE"
    fi
    WALRUS_FIRST=false

    # Determine target path
    target="${file#frontend/services/walrus/}"
    target="src/walrus/$target"

    size=$(get_size "$file")

    # Extract imports (simple version, AST will handle properly later)
    imports=$(extract_imports "$file" | head -5 | jq -R . | jq -s .)

    cat >> "$OUTPUT_FILE" <<JSON_ITEM
    {
      "current": "$file",
      "target": "$target",
      "size": $size,
      "imports": $imports
    }
JSON_ITEM
done

# Scan BrowserWalrusService files
find frontend/services -maxdepth 1 -type f \( -name "*Walrus*.js" -o -name "*Walrus*.jsx" \) 2>/dev/null | while read -r file; do
    echo "," >> "$OUTPUT_FILE"

    filename=$(basename "$file")
    target="src/walrus/$filename"
    size=$(get_size "$file")
    imports=$(extract_imports "$file" | head -5 | jq -R . | jq -s .)

    cat >> "$OUTPUT_FILE" <<JSON_ITEM
    {
      "current": "$file",
      "target": "$target",
      "size": $size,
      "imports": $imports
    }
JSON_ITEM
done

cat >> "$OUTPUT_FILE" <<'JSON_SECTION'
  ],
  "sdk_files": [
JSON_SECTION

# Scan SDK files (core, services, adapters, business, utils, interfaces, types)
echo "  Scanning SDK files..."
SDK_FIRST=true

# Core files
find frontend/core -type f \( -name "*.js" -o -name "*.jsx" \) 2>/dev/null | while read -r file; do
    if [[ "$SDK_FIRST" != "true" ]]; then
        echo "," >> "$OUTPUT_FILE"
    fi
    SDK_FIRST=false

    target="${file#frontend/core/}"
    target="src/sdk/core/$target"
    size=$(get_size "$file")
    imports=$(extract_imports "$file" | head -5 | jq -R . | jq -s .)

    cat >> "$OUTPUT_FILE" <<JSON_ITEM
    {
      "current": "$file",
      "target": "$target",
      "size": $size,
      "type": "core",
      "imports": $imports
    }
JSON_ITEM
done

# Services files (excluding walrus and luckysheet)
find frontend/services -type f \( -name "*.js" -o -name "*.jsx" \) \
    ! -path "*/walrus/*" \
    ! -path "*/luckysheet/*" \
    2>/dev/null | while read -r file; do

    if [[ "$SDK_FIRST" != "true" ]]; then
        echo "," >> "$OUTPUT_FILE"
    fi
    SDK_FIRST=false

    # Determine subdirectory
    if [[ "$file" =~ frontend/services/blockchain/ ]]; then
        target="${file#frontend/services/}"
        target="src/sdk/services/$target"
    elif [[ "$file" =~ frontend/services/formulas/ ]]; then
        target="${file#frontend/services/}"
        target="src/sdk/services/$target"
    elif [[ "$file" =~ frontend/services/testing/ ]]; then
        target="${file#frontend/services/}"
        target="src/sdk/services/$target"
    elif [[ "$file" =~ ^frontend/services/Browser ]]; then
        filename=$(basename "$file")
        if [[ "$filename" =~ Sui|Grpc|Blockchain ]]; then
            target="src/sdk/services/blockchain/$filename"
        else
            target="src/sdk/services/$filename"
        fi
    else
        target="${file#frontend/services/}"
        target="src/sdk/services/$target"
    fi

    size=$(get_size "$file")
    imports=$(extract_imports "$file" | head -5 | jq -R . | jq -s .)

    cat >> "$OUTPUT_FILE" <<JSON_ITEM
    {
      "current": "$file",
      "target": "$target",
      "size": $size,
      "type": "service",
      "imports": $imports
    }
JSON_ITEM
done

# Adapters
find frontend/adapters -type f \( -name "*.js" -o -name "*.jsx" \) 2>/dev/null | while read -r file; do
    echo "," >> "$OUTPUT_FILE"

    if [[ "$file" =~ atomicOperations/ ]]; then
        target="${file#frontend/adapters/atomicOperations/}"
        target="src/sdk/adapters/atomic/$target"
    elif [[ "$file" =~ BlockchainAdapter ]]; then
        target="src/sdk/adapters/BlockchainAdapter.js"
    elif [[ "$file" =~ StorageAdapter ]]; then
        target="src/sdk/adapters/storage/StorageAdapter.js"
    else
        target="${file#frontend/adapters/}"
        target="src/sdk/adapters/$target"
    fi

    size=$(get_size "$file")
    imports=$(extract_imports "$file" | head -5 | jq -R . | jq -s .)

    cat >> "$OUTPUT_FILE" <<JSON_ITEM
    {
      "current": "$file",
      "target": "$target",
      "size": $size,
      "type": "adapter",
      "imports": $imports
    }
JSON_ITEM
done

# Business logic
find frontend/business -type f \( -name "*.js" -o -name "*.jsx" \) 2>/dev/null | while read -r file; do
    echo "," >> "$OUTPUT_FILE"

    target="${file#frontend/business/}"
    if [[ ! "$target" =~ ^hooks/ ]]; then
        target="hooks/$target"
    fi
    target="src/sdk/business/$target"

    size=$(get_size "$file")
    imports=$(extract_imports "$file" | head -5 | jq -R . | jq -s .)

    cat >> "$OUTPUT_FILE" <<JSON_ITEM
    {
      "current": "$file",
      "target": "$target",
      "size": $size,
      "type": "business",
      "imports": $imports
    }
JSON_ITEM
done

# Interfaces
find frontend/interfaces -type f \( -name "*.js" -o -name "*.jsx" -o -name "*.ts" \) 2>/dev/null | while read -r file; do
    echo "," >> "$OUTPUT_FILE"

    target="${file#frontend/interfaces/}"
    target="src/sdk/interfaces/$target"
    size=$(get_size "$file")
    imports=$(extract_imports "$file" | head -5 | jq -R . | jq -s .)

    cat >> "$OUTPUT_FILE" <<JSON_ITEM
    {
      "current": "$file",
      "target": "$target",
      "size": $size,
      "type": "interface",
      "imports": $imports
    }
JSON_ITEM
done

# Types
find frontend/types -type f \( -name "*.ts" -o -name "*.d.ts" -o -name "*.json" \) 2>/dev/null | while read -r file; do
    echo "," >> "$OUTPUT_FILE"

    target="${file#frontend/types/}"
    target="src/sdk/types/$target"
    size=$(get_size "$file")

    cat >> "$OUTPUT_FILE" <<JSON_ITEM
    {
      "current": "$file",
      "target": "$target",
      "size": $size,
      "type": "type",
      "imports": []
    }
JSON_ITEM
done

# Utils
find frontend/utils -type f \( -name "*.js" -o -name "*.jsx" \) 2>/dev/null | while read -r file; do
    echo "," >> "$OUTPUT_FILE"

    target="${file#frontend/utils/}"
    target="src/sdk/utils/$target"
    size=$(get_size "$file")
    imports=$(extract_imports "$file" | head -5 | jq -R . | jq -s .)

    cat >> "$OUTPUT_FILE" <<JSON_ITEM
    {
      "current": "$file",
      "target": "$target",
      "size": $size,
      "type": "util",
      "imports": $imports
    }
JSON_ITEM
done

cat >> "$OUTPUT_FILE" <<'JSON_SECTION'
  ],
  "web_files": [
JSON_SECTION

# Scan Web files
echo "  Scanning Web UI files..."
WEB_FIRST=true

# Main entry point
if [[ -f "frontend/main.jsx" ]]; then
    cat >> "$OUTPUT_FILE" <<'JSON_ITEM'
    {
      "current": "frontend/main.jsx",
      "target": "web/main.jsx",
      "size":
JSON_ITEM
    get_size "frontend/main.jsx" >> "$OUTPUT_FILE"
    cat >> "$OUTPUT_FILE" <<'JSON_ITEM'
,
      "type": "entry",
      "imports": []
    }
JSON_ITEM
    WEB_FIRST=false
fi

# Presentation App
if [[ -f "frontend/presentation/App.jsx" ]]; then
    if [[ "$WEB_FIRST" != "true" ]]; then
        echo "," >> "$OUTPUT_FILE"
    fi
    WEB_FIRST=false

    cat >> "$OUTPUT_FILE" <<'JSON_ITEM'
    {
      "current": "frontend/presentation/App.jsx",
      "target": "web/App.jsx",
      "size":
JSON_ITEM
    get_size "frontend/presentation/App.jsx" >> "$OUTPUT_FILE"
    cat >> "$OUTPUT_FILE" <<'JSON_ITEM'
,
      "type": "app",
      "imports": []
    }
JSON_ITEM
fi

# Components (presentation)
find frontend/presentation/components -type f \( -name "*.jsx" -o -name "*.js" \) 2>/dev/null | while read -r file; do
    echo "," >> "$OUTPUT_FILE"

    target="${file#frontend/presentation/components/}"
    target="web/components/$target"
    size=$(get_size "$file")
    imports=$(extract_imports "$file" | head -5 | jq -R . | jq -s .)

    cat >> "$OUTPUT_FILE" <<JSON_ITEM
    {
      "current": "$file",
      "target": "$target",
      "size": $size,
      "type": "component",
      "source": "presentation",
      "imports": $imports
    }
JSON_ITEM
done

# Components (legacy)
find frontend/components -type f \( -name "*.jsx" -o -name "*.js" \) 2>/dev/null | while read -r file; do
    echo "," >> "$OUTPUT_FILE"

    target="${file#frontend/components/}"
    target="web/components/$target"
    size=$(get_size "$file")
    imports=$(extract_imports "$file" | head -5 | jq -R . | jq -s .)

    cat >> "$OUTPUT_FILE" <<JSON_ITEM
    {
      "current": "$file",
      "target": "$target",
      "size": $size,
      "type": "component",
      "source": "legacy",
      "imports": $imports
    }
JSON_ITEM
done

# Pages (presentation)
find frontend/presentation/pages -type f \( -name "*.jsx" -o -name "*.js" \) 2>/dev/null | while read -r file; do
    echo "," >> "$OUTPUT_FILE"

    target="${file#frontend/presentation/pages/}"
    target="web/pages/$target"
    size=$(get_size "$file")
    imports=$(extract_imports "$file" | head -5 | jq -R . | jq -s .)

    cat >> "$OUTPUT_FILE" <<JSON_ITEM
    {
      "current": "$file",
      "target": "$target",
      "size": $size,
      "type": "page",
      "source": "presentation",
      "imports": $imports
    }
JSON_ITEM
done

# Pages (legacy)
find frontend/pages -type f \( -name "*.jsx" -o -name "*.js" \) 2>/dev/null | while read -r file; do
    echo "," >> "$OUTPUT_FILE"

    target="${file#frontend/pages/}"
    target="web/pages/$target"
    size=$(get_size "$file")
    imports=$(extract_imports "$file" | head -5 | jq -R . | jq -s .)

    cat >> "$OUTPUT_FILE" <<JSON_ITEM
    {
      "current": "$file",
      "target": "$target",
      "size": $size,
      "type": "page",
      "source": "legacy",
      "imports": $imports
    }
JSON_ITEM
done

# Providers
find frontend/providers -type f \( -name "*.jsx" -o -name "*.js" \) 2>/dev/null | while read -r file; do
    echo "," >> "$OUTPUT_FILE"

    target="${file#frontend/providers/}"
    target="web/providers/$target"
    size=$(get_size "$file")
    imports=$(extract_imports "$file" | head -5 | jq -R . | jq -s .)

    cat >> "$OUTPUT_FILE" <<JSON_ITEM
    {
      "current": "$file",
      "target": "$target",
      "size": $size,
      "type": "provider",
      "imports": $imports
    }
JSON_ITEM
done

# Hooks (presentation layer only)
find frontend/presentation/hooks -type f \( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" \) 2>/dev/null | while read -r file; do
    echo "," >> "$OUTPUT_FILE"

    target="${file#frontend/presentation/hooks/}"
    target="web/hooks/$target"
    size=$(get_size "$file")
    imports=$(extract_imports "$file" | head -5 | jq -R . | jq -s .)

    cat >> "$OUTPUT_FILE" <<JSON_ITEM
    {
      "current": "$file",
      "target": "$target",
      "size": $size,
      "type": "hook",
      "imports": $imports
    }
JSON_ITEM
done

# Top-level hooks (wallet connection hooks)
find frontend/hooks -maxdepth 1 -type f \( -name "*.ts" -o -name "*.tsx" \) 2>/dev/null | while read -r file; do
    echo "," >> "$OUTPUT_FILE"

    target="${file#frontend/hooks/}"
    target="web/hooks/$target"
    size=$(get_size "$file")
    imports=$(extract_imports "$file" | head -5 | jq -R . | jq -s .)

    cat >> "$OUTPUT_FILE" <<JSON_ITEM
    {
      "current": "$file",
      "target": "$target",
      "size": $size,
      "type": "hook",
      "imports": $imports
    }
JSON_ITEM
done

# Luckysheet services
find frontend/services/luckysheet -type f \( -name "*.js" -o -name "*.jsx" \) 2>/dev/null | while read -r file; do
    echo "," >> "$OUTPUT_FILE"

    target="${file#frontend/services/luckysheet/}"
    target="web/services/luckysheet/$target"
    size=$(get_size "$file")
    imports=$(extract_imports "$file" | head -5 | jq -R . | jq -s .)

    cat >> "$OUTPUT_FILE" <<JSON_ITEM
    {
      "current": "$file",
      "target": "$target",
      "size": $size,
      "type": "service",
      "imports": $imports
    }
JSON_ITEM
done

# Styles
find frontend/presentation/styles -type f -name "*.css" 2>/dev/null | while read -r file; do
    echo "," >> "$OUTPUT_FILE"

    target="${file#frontend/presentation/styles/}"
    target="web/styles/$target"
    size=$(get_size "$file")

    cat >> "$OUTPUT_FILE" <<JSON_ITEM
    {
      "current": "$file",
      "target": "$target",
      "size": $size,
      "type": "style",
      "imports": []
    }
JSON_ITEM
done

cat >> "$OUTPUT_FILE" <<'JSON_END'
  ]
}
JSON_END

echo "Inventory scan complete: $OUTPUT_FILE"
echo ""
echo "Summary:"
echo "  Walrus files: $(jq '.walrus_files | length' "$OUTPUT_FILE")"
echo "  SDK files: $(jq '.sdk_files | length' "$OUTPUT_FILE")"
echo "  Web files: $(jq '.web_files | length' "$OUTPUT_FILE")"
echo "  Total: $(jq '[.walrus_files, .sdk_files, .web_files] | add | length' "$OUTPUT_FILE")"
