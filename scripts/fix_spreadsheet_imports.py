#!/usr/bin/env python3
"""
Fix spreadsheet component imports.

This script fixes files that incorrectly import from @shared/components/spreadsheet
(which doesn't exist) to the correct @features/spreadsheet/components/ paths.
"""

import re
from pathlib import Path

# Project root
ROOT = Path(__file__).parent.parent

# Files with incorrect spreadsheet imports
FILES_TO_FIX = {
    "frontend/features/explore/pages/ExploreTundra.jsx": {
        "old_pattern": r"import\s+\{([^}]+)\}\s+from\s+['\"]@features/dashboard/components/spreadsheet['\"]",
        "imports": ["useSpreadsheetContext"],
        "new_import": "import { useSpreadsheetContext } from '@features/spreadsheet/components/SpreadsheetProvider.jsx';",
    },
    # Add more files if found with similar issues
}

# Additional relative import fixes for spreadsheet components
RELATIVE_FIXES = {
    "frontend/features/spreadsheet/components/Header.jsx": [
        {
            "old": "import { NetworkSelector } from '../NetworkSelector.jsx';",
            "new": "import { NetworkSelector } from '@features/network/components/NetworkSelector.jsx';",
        }
    ],
    "frontend/features/spreadsheet/components/MainLayout.jsx": [
        {
            "old": "import { Collaboration } from '../Collaboration.jsx';",
            "new": "// import { Collaboration } from '../Collaboration.jsx'; // Collaboration component removed/disabled",
        }
    ],
    "frontend/features/spreadsheet/components/StatusBar.jsx": [
        {
            "old": "import { faucetService } from '../../../services/FaucetService.js';",
            "new": "import { faucetService } from '@services/FaucetService.js';",
        }
    ],
    "frontend/features/spreadsheet/components/SaveDetailsModal.jsx": [
        {
            "old": "} from '../../../utils/ExplorerLinks.js';",
            "new": "} from '@utils/ExplorerLinks.js';",
        }
    ],
    "frontend/features/spreadsheet/components/SpreadsheetProvider.jsx": [
        {
            "old": "import { setupGlobalDevTools } from '../../../utils/devTools.js';",
            "new": "import { setupGlobalDevTools } from '@utils/devTools.js';",
        }
    ],
    "frontend/features/spreadsheet/pages/SpreadsheetWorkspace.jsx": [
        {
            "old": "import { WALSHEETZ_FUNCTION_METADATA } from '../../services/formulas/WalSheetzFunctions.js';",
            "new": "import { WALSHEETZ_FUNCTION_METADATA } from '@services/integrations/formulas/WalSheetzFunctions.js';",
        }
    ],
}

def fix_import_pattern(file_path: Path, pattern: str, new_import: str) -> bool:
    """Fix imports matching a specific pattern."""
    content = file_path.read_text()

    if re.search(pattern, content):
        # Replace the old import with the new one
        new_content = re.sub(pattern, new_import, content)
        file_path.write_text(new_content)
        return True
    return False

def fix_relative_imports(file_path: Path, fixes: list) -> int:
    """Fix multiple relative imports in a file."""
    content = file_path.read_text()
    changes = 0

    for fix in fixes:
        old = fix["old"]
        new = fix["new"]

        if old in content:
            content = content.replace(old, new)
            changes += 1
            print(f"    • Fixed: {old[:50]}...")

    if changes > 0:
        file_path.write_text(content)

    return changes

def main():
    print("🔧 Fixing spreadsheet component imports\n")
    print(f"Root directory: {ROOT}\n")

    fixed_count = 0
    total_changes = 0

    # Fix pattern-based imports
    print("=" * 60)
    print("Fixing incorrect @features/dashboard/components/spreadsheet imports\n")

    for file_rel_path, config in FILES_TO_FIX.items():
        file_path = ROOT / file_rel_path

        if not file_path.exists():
            print(f"  ⚠️  File not found: {file_path.relative_to(ROOT)}")
            continue

        print(f"Processing: {file_rel_path}")

        if fix_import_pattern(file_path, config["old_pattern"], config["new_import"]):
            print(f"  ✅ Fixed pattern import")
            fixed_count += 1
        else:
            print(f"  ℹ️  No pattern matches found")
        print()

    # Fix relative imports
    print("=" * 60)
    print("Fixing relative imports in spreadsheet components\n")

    for file_rel_path, fixes in RELATIVE_FIXES.items():
        file_path = ROOT / file_rel_path

        if not file_path.exists():
            print(f"  ⚠️  File not found: {file_path.relative_to(ROOT)}")
            continue

        print(f"Processing: {file_rel_path}")

        changes = fix_relative_imports(file_path, fixes)
        if changes > 0:
            print(f"  ✅ Fixed {changes} imports")
            fixed_count += 1
            total_changes += changes
        else:
            print(f"  ℹ️  No changes needed")
        print()

    print("=" * 60)
    print(f"✅ Fixed {fixed_count} files")
    print(f"✅ Made {total_changes} total import changes")
    print("=" * 60)

if __name__ == "__main__":
    main()
