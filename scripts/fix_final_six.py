#!/usr/bin/env python3
"""
Fix the final 6 remaining import errors
"""

import re
from pathlib import Path

# Base directory
BASE_DIR = Path(__file__).parent.parent

# Define the final 6 import fixes
IMPORT_FIXES = [
    # useSpreadsheetImport.js - remove extra /hooks/ directory
    {
        'files': [
            'frontend/features/spreadsheet/hooks/useSpreadsheet.js',
        ],
        'old': r"from ['\"]\.\/hooks\/useSpreadsheetImport\.js['\"]",
        'new': "from './useSpreadsheetImport.js'"
    },

    # OfflineModeService.js - update to correct path
    {
        'files': [
            'frontend/adapters/BlockchainAdapter.js',
        ],
        'old': r"from ['\"]\.\.\/services\/OfflineModeService\.js['\"]",
        'new': "from '@services/storage/OfflineModeService.js'"
    },
]

def fix_imports():
    """Apply all import fixes"""
    total_fixed = 0

    for fix in IMPORT_FIXES:
        files = fix['files']
        old_pattern = fix['old']
        new_import = fix['new']

        for file_path_str in files:
            file_path = BASE_DIR / file_path_str

            if not file_path.exists():
                print(f"⚠️  File not found: {file_path}")
                continue

            # Read file
            content = file_path.read_text()
            original_content = content

            # Apply fix
            content = re.sub(old_pattern, new_import, content)

            if content != original_content:
                file_path.write_text(content)
                print(f"✅ Fixed: {file_path_str}")
                total_fixed += 1
            else:
                print(f"⏭️  No changes needed: {file_path_str}")

    return total_fixed

def main():
    print("=" * 60)
    print("Final Six Import Fixes")
    print("=" * 60)

    total_fixed = fix_imports()

    print("\n" + "=" * 60)
    print(f"✅ Fixed {total_fixed} files")
    print("=" * 60)

if __name__ == '__main__':
    main()
