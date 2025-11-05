#!/usr/bin/env python3
"""
Fix CSS import paths
"""

import re
from pathlib import Path

# Base directory
BASE_DIR = Path(__file__).parent.parent

# Define all CSS import fixes
CSS_FIXES = [
    # NetworkSelector.css - from components/ to styles/
    {
        'files': [
            'frontend/features/network/components/NetworkSelector.jsx',
        ],
        'old': r"import ['\"]\.\/styles\/NetworkSelector\.css['\"]",
        'new': "import '../styles/NetworkSelector.css'"
    },

    # NetworkMismatchWarning.css - from components/ to styles/
    {
        'files': [
            'frontend/features/network/components/NetworkMismatchWarning.jsx',
        ],
        'old': r"import ['\"]\.\/styles\/NetworkMismatchWarning\.css['\"]",
        'new': "import '../styles/NetworkMismatchWarning.css'"
    },

    # NetworkBadge.css - from components/ to styles/
    {
        'files': [
            'frontend/features/network/components/NetworkBadge.jsx',
        ],
        'old': r"import ['\"]\.\/styles\/NetworkBadge\.css['\"]",
        'new': "import '../styles/NetworkBadge.css'"
    },

    # spreadsheet-editor.css - from pages/ to styles/
    {
        'files': [
            'frontend/features/spreadsheet/pages/SpreadsheetEditor.jsx',
        ],
        'old': r"import ['\"]\.\/styles\/spreadsheet-editor\.css['\"]",
        'new': "import '../styles/spreadsheet-editor.css'"
    },
]

def fix_css_imports():
    """Apply all CSS import fixes"""
    total_fixed = 0

    for fix in CSS_FIXES:
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
    print("CSS Import Path Fixer")
    print("=" * 60)

    total_fixed = fix_css_imports()

    print("\n" + "=" * 60)
    print(f"✅ Fixed {total_fixed} files")
    print("=" * 60)

if __name__ == '__main__':
    main()
