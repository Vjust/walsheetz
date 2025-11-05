#!/usr/bin/env python3
"""
Final import fixes for remaining issues
"""

import re
from pathlib import Path

# Base directory
BASE_DIR = Path(__file__).parent.parent

# Define all final import fixes
IMPORT_FIXES = [
    # Logger.js in RateLimiter.js - fix path
    {
        'files': [
            'frontend/utils/helpers/RateLimiter.js',
        ],
        'old': r"from ['\"]\.\/Logger\.js['\"]",
        'new': "from '@utils/logging/Logger.js'"
    },

    # ConfigLoader.js fixes - use @utils alias
    {
        'files': [
            'frontend/features/spreadsheet/components/MainLayout.jsx',
            'frontend/features/spreadsheet/components/Header.jsx',
        ],
        'old': r"from ['\"]\.\.\/\.\.\/\.\.\/utils\/ConfigLoader\.js['\"]",
        'new': "from '@utils/config/ConfigLoader.js'"
    },
    {
        'files': [
            'frontend/utils/validation/ValidationGuards.js',
        ],
        'old': r"from ['\"]\.\/ConfigLoader\.js['\"]",
        'new': "from '@utils/config/ConfigLoader.js'"
    },

    # TransactionExperience.js fixes
    {
        'files': [
            'frontend/utils/config/ConfigLoader.js',
        ],
        'old': r"from ['\"]\.\/TransactionExperience\.js['\"]",
        'new': "from '@utils/helpers/TransactionExperience.js'"
    },

    # StorageAdapter.js fixes
    {
        'files': [
            'frontend/features/spreadsheet/hooks/useSpreadsheet.js',
        ],
        'old': r"from ['\"]\.\.\/adapters\/StorageAdapter\.js['\"]",
        'new': "from '@adapters/StorageAdapter.js'"
    },

    # AbiHelpers.js fixes
    {
        'files': [
            'frontend/utils/helpers/devTools.js',
        ],
        'old': r"from ['\"]\.\/AbiHelpers\.js['\"]",
        'new': "from '@utils/blockchain/AbiHelpers.js'"
    },

    # CircuitBreaker.js fixes
    {
        'files': [
            'frontend/features/spreadsheet/engine/SpreadsheetEngine.js',
        ],
        'old': r"from ['\"]\.\.\/utils\/CircuitBreaker\.js['\"]",
        'new': "from '@utils/helpers/CircuitBreaker.js'"
    },

    # mockWalletConnection.js fixes
    {
        'files': [
            'frontend/shared/hooks/useWalletConnectionFactory.ts',
        ],
        'old': r"from ['\"]\.\.\/services\/testing\/mockWalletConnection\.js['\"]",
        'new': "from '@services/infrastructure/testing/mockWalletConnection.js'"
    },

    # CollaborationService.js fixes
    {
        'files': [
            'frontend/adapters/BlockchainAdapter.js',
        ],
        'old': r"from ['\"]\.\.\/services\/CollaborationService\.js['\"]",
        'new': "from '@services/infrastructure/CollaborationService.js'"
    },

    # StandardizedErrorHandler.js fixes
    {
        'files': [
            'frontend/services/blockchain/AtomicOperationManager.js',
        ],
        'old': r"from ['\"]\.\.\/\.\.\/utils\/StandardizedErrorHandler\.js['\"]",
        'new': "from '@utils/errors/StandardizedErrorHandler.js'"
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
    print("Final Import Fixes")
    print("=" * 60)

    total_fixed = fix_imports()

    print("\n" + "=" * 60)
    print(f"✅ Fixed {total_fixed} files")
    print("=" * 60)

if __name__ == '__main__':
    main()
