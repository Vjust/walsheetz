#!/usr/bin/env python3
"""
Fix the last remaining import issues
"""

import re
from pathlib import Path

# Base directory
BASE_DIR = Path(__file__).parent.parent

# Define final import fixes
IMPORT_FIXES = [
    # MigrationDialog.css - fix path
    {
        'files': [
            'frontend/features/network/components/MigrationDialog.jsx',
        ],
        'old': r"import ['\"]\.\/styles\/MigrationDialog\.css['\"]",
        'new': "import '../styles/MigrationDialog.css'"
    },

    # TestModeAdapter.js
    {
        'files': [
            'frontend/features/spreadsheet/hooks/useSpreadsheet.js',
        ],
        'old': r"from ['\"]\.\.\/services\/testing\/TestModeAdapter\.js['\"]",
        'new': "from '@services/infrastructure/testing/TestModeAdapter.js'"
    },

    # Logger.js in TransactionExperience.js
    {
        'files': [
            'frontend/utils/helpers/TransactionExperience.js',
        ],
        'old': r"from ['\"]\.\/Logger\.js['\"]",
        'new': "from '@utils/logging/Logger.js'"
    },

    # SuiFunctions.js in SpreadsheetEngine
    {
        'files': [
            'frontend/features/spreadsheet/engine/SpreadsheetEngine.js',
        ],
        'old': r"from ['\"]\.\.\/services\/formulas\/SuiFunctions\.js['\"]",
        'new': "from '@services/integrations/formulas/SuiFunctions.js'"
    },

    # ErrorRecoveryService.js
    {
        'files': [
            'frontend/adapters/BlockchainAdapter.js',
        ],
        'old': r"from ['\"]\.\.\/services\/ErrorRecoveryService\.js['\"]",
        'new': "from '@services/infrastructure/ErrorRecoveryService.js'"
    },

    # TransactionExperience.js in AtomicOperationManager
    {
        'files': [
            'frontend/services/blockchain/AtomicOperationManager.js',
        ],
        'old': r"from ['\"]\.\.\/\.\.\/utils\/TransactionExperience\.js['\"]",
        'new': "from '@utils/helpers/TransactionExperience.js'"
    },

    # Logger.js in StandardizedErrorHandler
    {
        'files': [
            'frontend/utils/errors/StandardizedErrorHandler.js',
        ],
        'old': r"from ['\"]\.\/Logger\.js['\"]",
        'new': "from '@utils/logging/Logger.js'"
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
    print("Final Import Fixes - Last 7 Errors")
    print("=" * 60)

    total_fixed = fix_imports()

    print("\n" + "=" * 60)
    print(f"✅ Fixed {total_fixed} files")
    print("=" * 60)

if __name__ == '__main__':
    main()
