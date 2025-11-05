#!/usr/bin/env python3
"""
Fix remaining import issues found by verify_imports.py
"""

import re
from pathlib import Path

ROOT = Path(__file__).parent.parent

# Additional files to fix
FIXES = {
    "frontend/services/blockchain/transactions/atomic/wallet/BrowserWalletManager.js": [
        (r"from ['\"]\.\.\/\.\.\/blockchain\/([^'\"]+)['\"]", r"from '@blockchain/\1'"),
    ],
    "frontend/services/blockchain/transactions/atomic/walrus/BrowserWalrusService.js": [
        (r"from ['\"]\.\.\/\.\.\/blockchain\/([^'\"]+)['\"]", r"from '@blockchain/\1'"),
    ],
    "frontend/services/blockchain/transactions/atomic/walrus/WalrusSdkClient.js": [
        (r"from ['\"]\.\.\/\.\.\/blockchain\/([^'\"]+)['\"]", r"from '@blockchain/\1'"),
    ],
    "frontend/services/blockchain/walrus/WalrusSdkClient.js": [
        (r"from ['\"]\.\.\/\.\.\/blockchain\/([^'\"]+)['\"]", r"from '@blockchain/\1'"),
    ],
    "frontend/shared/components/WalletAssetTable.jsx": [
        (r"from ['\"]\.\.\/\.\.\/\.\.\/blockchain\/([^'\"]+)['\"]", r"from '@blockchain/\1'"),
    ],
    "frontend/shared/hooks/useWalrusExplorer.js": [
        (r"from ['\"]\.\.\/\.\.\/\.\.\/blockchain\/([^'\"]+)['\"]", r"from '@blockchain/\1'"),
    ],
    "frontend/features/spreadsheet/pages/SpreadsheetEditor.jsx": [
        (r"from '@shared/components/spreadsheet'", r"from '@features/spreadsheet/components'"),
    ],
    "frontend/features/spreadsheet/pages/SpreadsheetWorkspace.jsx": [
        (r"from '@features/dashboard/components/spreadsheet'", r"from '@features/spreadsheet/components'"),
    ],
}

def fix_file(file_path: Path, patterns: list) -> bool:
    """Fix imports in a file using the given patterns."""
    if not file_path.exists():
        print(f"  ⚠️  File not found: {file_path.relative_to(ROOT)}")
        return False

    content = file_path.read_text()
    original_content = content
    changes_made = False

    for pattern, replacement in patterns:
        new_content = re.sub(pattern, replacement, content)
        if new_content != content:
            changes_made = True
            count = len(re.findall(pattern, content))
            print(f"    • Fixed {count} imports matching pattern")
        content = new_content

    if changes_made:
        file_path.write_text(content)
        print(f"  ✅ Fixed: {file_path.relative_to(ROOT)}")
        return True
    else:
        print(f"  ℹ️  No changes: {file_path.relative_to(ROOT)}")
        return False

def main():
    print("🔧 Fixing remaining import issues\n")
    print(f"Root directory: {ROOT}\n")

    fixed_count = 0
    for file_rel_path, patterns in FIXES.items():
        file_path = ROOT / file_rel_path
        print(f"Processing: {file_rel_path}")
        if fix_file(file_path, patterns):
            fixed_count += 1
        print()

    print("=" * 60)
    print(f"✅ Fixed {fixed_count} files")
    print("=" * 60)

if __name__ == "__main__":
    main()
