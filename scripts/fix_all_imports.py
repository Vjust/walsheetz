#!/usr/bin/env python3
"""
Comprehensive import fixer for WalSheetz project
Fixes all remaining import path issues in one pass
"""

import re
from pathlib import Path

# Base directory
BASE_DIR = Path(__file__).parent.parent
FRONTEND_DIR = BASE_DIR / 'frontend'

# Define all import fixes as tuples of (file_pattern, old_import, new_import)
IMPORT_FIXES = [
    # Logger.js fixes - from utils/helpers to utils/logging
    {
        'files': [
            'frontend/utils/helpers/EventBus.js',
            'frontend/utils/helpers/BlobParser.js',
        ],
        'old': r"from ['\"]\.\/Logger\.js['\"]",
        'new': "from '@utils/logging/Logger.js'"
    },

    # NetworkLock.js fixes - use @utils alias
    {
        'files': [
            'frontend/shared/providers/NetworkProvider.jsx',
        ],
        'old': r"from ['\"]\.\.\/utils\/NetworkLock\.js['\"]",
        'new': "from '@utils/helpers/NetworkLock.js'"
    },
    {
        'files': [
            'frontend/utils/config/ConfigLoader.js',
        ],
        'old': r"from ['\"]\.\/NetworkLock\.js['\"]",
        'new': "from '@utils/helpers/NetworkLock.js'"
    },

    # RateLimiter.js fixes - use @utils alias
    {
        'files': [
            'frontend/services/blockchain/walrus/BrowserWalrusService.js',
        ],
        'old': r"from ['\"]\.\.\/utils\/RateLimiter\.js['\"]",
        'new': "from '@utils/helpers/RateLimiter.js'"
    },

    # ExplorerLinks.js fixes - use @utils alias
    {
        'files': [
            'frontend/features/spreadsheet/components/SaveDetailsModal.jsx',
        ],
        'old': r"from ['\"]@utils\/ExplorerLinks\.js['\"]",
        'new': "from '@utils/blockchain/ExplorerLinks.js'"
    },

    # devTools.js fixes - use @utils alias
    {
        'files': [
            'frontend/features/spreadsheet/components/SpreadsheetProvider.jsx',
        ],
        'old': r"from ['\"]\.\.\/\.\.\/\.\.\/utils\/devTools\.js['\"]",
        'new': "from '@utils/helpers/devTools.js'"
    },

    # FaucetService.js fixes - use @services alias
    {
        'files': [
            'frontend/features/spreadsheet/components/StatusBar.jsx',
        ],
        'old': r"from ['\"]\.\.\/\.\.\/\.\.\/services\/FaucetService\.js['\"]",
        'new': "from '@services/blockchain/transactions/FaucetService.js'"
    },

    # BlockchainAdapter.js fixes - use @adapters alias
    {
        'files': [
            'frontend/features/spreadsheet/hooks/useSpreadsheet.js',
        ],
        'old': r"from ['\"]\.\.\/adapters\/BlockchainAdapter\.js['\"]",
        'new': "from '@adapters/BlockchainAdapter.js'"
    },

    # IPoAStatus.js fixes - use @interfaces alias
    {
        'files': [
            'frontend/features/explore/pages/BlobCatalog.jsx',
        ],
        'old': r"from ['\"]\.\.\/\.\.\/interfaces\/graphql\/IPoAStatus\.js['\"]",
        'new': "from '@interfaces/graphql/IPoAStatus.js'"
    },

    # BlobParser.js fixes - use @utils alias
    {
        'files': [
            'frontend/services/SpreadsheetImportExportService.js',
        ],
        'old': r"from ['\"]\.\.\/utils\/BlobParser\.js['\"]",
        'new': "from '@utils/helpers/BlobParser.js'"
    },

    # sui-transaction-runner.js fixes - use @blockchain alias
    {
        'files': [
            'frontend/services/blockchain/wallet/BrowserWalletManager.js',
        ],
        'old': r"from ['\"]\.\.\/\.\.\/blockchain\/sui-transaction-runner\.js['\"]",
        'new': "from '@blockchain/sui-transaction-runner.js'"
    },

    # BrowserWalletManager.js fixes - use correct path
    {
        'files': [
            'frontend/services/blockchain/sui/BrowserSuiService.js',
        ],
        'old': r"from ['\"]\.\/BrowserWalletManager\.js['\"]",
        'new': "from '@services/blockchain/wallet/BrowserWalletManager.js'"
    },

    # ConfigLoader.js fixes - use @utils alias
    {
        'files': [
            'frontend/utils/blockchain/AbiHelpers.js',
        ],
        'old': r"from ['\"]\.\/ConfigLoader\.js['\"]",
        'new': "from '@utils/config/ConfigLoader.js'"
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
    print("Comprehensive Import Fixer for WalSheetz")
    print("=" * 60)

    total_fixed = fix_imports()

    print("\n" + "=" * 60)
    print(f"✅ Fixed {total_fixed} files")
    print("=" * 60)

if __name__ == '__main__':
    main()
