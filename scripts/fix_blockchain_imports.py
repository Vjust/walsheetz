#!/usr/bin/env python3
"""
Fix blockchain relative imports to use @blockchain alias.

This script fixes files that incorrectly import from blockchain/ using relative paths
like ../../blockchain/ or ../../../blockchain/, replacing them with the @blockchain/ alias
configured in vite.config.js.
"""

import re
from pathlib import Path

# Project root
ROOT = Path(__file__).parent.parent

# Files to fix with their incorrect import patterns
FILES_TO_FIX = [
    # Services using ../../blockchain/
    "frontend/services/blockchain/walrus/BrowserWalrusService.js",
    "frontend/services/blockchain/wallet/BrowserWalletManager.js",
    "frontend/services/blockchain/sui/BrowserSuiService.js",

    # Features using ../../../blockchain/
    "frontend/features/explore/pages/BlobCatalog.jsx",

    # Services/integrations using ../../../blockchain/
    "frontend/services/integrations/formulas/SuiFunctions.js",
]

# Import patterns to fix
PATTERNS = [
    # Match ../../blockchain/something
    (r"from\s+['\"]\.\.\/\.\.\/blockchain\/([^'\"]+)['\"]", r"from '@blockchain/\1'"),

    # Match ../../../blockchain/something
    (r"from\s+['\"]\.\.\/\.\.\/\.\.\/blockchain\/([^'\"]+)['\"]", r"from '@blockchain/\1'"),

    # Match import ... from "../../blockchain/..."
    (r"import\s+(.+)\s+from\s+['\"]\.\.\/\.\.\/blockchain\/([^'\"]+)['\"]", r"import \1 from '@blockchain/\2'"),

    # Match import ... from "../../../blockchain/..."
    (r"import\s+(.+)\s+from\s+['\"]\.\.\/\.\.\/\.\.\/blockchain\/([^'\"]+)['\"]", r"import \1 from '@blockchain/\2'"),
]

def fix_file(file_path: Path) -> bool:
    """Fix blockchain imports in a single file."""
    if not file_path.exists():
        print(f"  ⚠️  File not found: {file_path}")
        return False

    content = file_path.read_text()
    original_content = content

    # Apply all patterns
    changes_made = False
    for pattern, replacement in PATTERNS:
        new_content = re.sub(pattern, replacement, content)
        if new_content != content:
            changes_made = True
            # Count how many replacements
            count = len(re.findall(pattern, content))
            print(f"    • Applied pattern: {pattern[:50]}... ({count} matches)")
        content = new_content

    if changes_made:
        file_path.write_text(content)
        print(f"  ✅ Fixed: {file_path.relative_to(ROOT)}")
        return True
    else:
        print(f"  ℹ️  No changes needed: {file_path.relative_to(ROOT)}")
        return False

def main():
    print("🔧 Fixing blockchain relative imports to use @blockchain alias\n")
    print(f"Root directory: {ROOT}\n")

    fixed_count = 0
    skipped_count = 0

    for file_rel_path in FILES_TO_FIX:
        file_path = ROOT / file_rel_path
        print(f"Processing: {file_rel_path}")

        if fix_file(file_path):
            fixed_count += 1
        else:
            skipped_count += 1
        print()

    print("=" * 60)
    print(f"✅ Fixed {fixed_count} files")
    print(f"ℹ️  Skipped {skipped_count} files (no changes needed)")
    print("=" * 60)

if __name__ == "__main__":
    main()
