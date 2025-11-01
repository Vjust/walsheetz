#!/bin/bash
# Re-run import rewrites on all SDK files with updated patterns

echo "Re-running import rewrites on SDK files..."
echo "============================================================"

count=0
rewrote=0

for file in $(find src/sdk -type f -name "*.js"); do
  count=$((count + 1))
  result=$(node scripts/refactor/rewrite-imports.mjs "$file" scripts/refactor/import-rewrite-map.json 2>&1)

  if echo "$result" | grep -q "Rewrote imports"; then
    echo "  ✓ $file"
    rewrote=$((rewrote + 1))
  fi
done

echo ""
echo "============================================================"
echo "Processed: $count files"
echo "Rewrote: $rewrote files"
