#!/usr/bin/env python3
"""
Fix component and service imports
"""

import re
from pathlib import Path

# Base directory
BASE_DIR = Path(__file__).parent.parent

# Define all import fixes
IMPORT_FIXES = [
    # Collaboration.jsx fixes - use @shared/components
    {
        'files': [
            'frontend/features/spreadsheet/components/MainLayout.jsx',
        ],
        'old': r"from ['\"]\.\.\/Collaboration\.jsx['\"]",
        'new': "from '@shared/components/Collaboration.jsx'"
    },

    # NetworkSelector.jsx fixes - use @features
    {
        'files': [
            'frontend/features/spreadsheet/components/Header.jsx',
        ],
        'old': r"from ['\"]\.\.\/NetworkSelector\.jsx['\"]",
        'new': "from '@features/network/components/NetworkSelector.jsx'"
    },

    # DeFiStateManager.js fixes - use @services
    {
        'files': [
            'frontend/features/spreadsheet/engine/SpreadsheetEngine.js',
        ],
        'old': r"from ['\"]\.\.\/services\/DeFiStateManager\.js['\"]",
        'new': "from '@services/DeFiStateManager.js'"
    },

    # SpreadsheetMigrator.js fixes - use @services
    {
        'files': [
            'frontend/features/network/components/MigrationDialog.jsx',
        ],
        'old': r"from ['\"]\.\.\/\.\.\/services\/SpreadsheetMigrator\.js['\"]",
        'new': "from '@services/SpreadsheetMigrator.js'"
    },

    # WalSheetzFunctions.js fixes - use @services
    {
        'files': [
            'frontend/shared/hooks/useSpreadsheetLifecycle.js',
        ],
        'old': r"from ['\"]\.\.\/\.\.\/services\/formulas\/WalSheetzFunctions\.js['\"]",
        'new': "from '@services/integrations/formulas/WalSheetzFunctions.js'"
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
    print("Component & Service Import Fixer")
    print("=" * 60)

    total_fixed = fix_imports()

    print("\n" + "=" * 60)
    print(f"✅ Fixed {total_fixed} files")
    print("=" * 60)

if __name__ == '__main__':
    main()
