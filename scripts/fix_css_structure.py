#!/usr/bin/env python3
"""
Fix CSS file structure and import paths.

This script fixes:
1. Moves CSS files from dashboard/styles/styles/ to dashboard/styles/
2. Fixes ArcticSprite CSS import path
3. Fixes component CSS imports to match actual file locations
"""

import shutil
from pathlib import Path

# Project root
ROOT = Path(__file__).parent.parent

# CSS files to move from double-nested styles/styles/ directory
CSS_FILES_TO_MOVE = [
    "frontend/features/dashboard/styles/styles/search-bar.css",
    "frontend/features/dashboard/styles/styles/document-card.css",
    "frontend/features/dashboard/styles/styles/breadcrumb-navigation.css",
    "frontend/features/dashboard/styles/styles/create-document-modal.css",
]

# Component import fixes
COMPONENT_IMPORTS_TO_FIX = {
    "frontend/shared/components/ArcticSprite.jsx": {
        "old": "import '../styles/arctic-sprite.css'",
        "new": "import './arctic-sprite.css'",
    },
    "frontend/shared/components/UnicornStudioHero.jsx": {
        "old": "import '../styles/unicorn-studio-hero.css'",
        "new": "import './unicorn-studio-hero.css'",
    },
}

def move_css_files():
    """Move CSS files from double-nested directory."""
    print("📦 Moving CSS files from styles/styles/ to styles/\n")

    moved_count = 0
    for css_rel_path in CSS_FILES_TO_MOVE:
        css_path = ROOT / css_rel_path
        if not css_path.exists():
            print(f"  ⚠️  CSS file not found: {css_path.relative_to(ROOT)}")
            continue

        # Target is one level up (remove one 'styles/')
        target_path = css_path.parent.parent / css_path.name

        print(f"  Moving: {css_path.relative_to(ROOT)}")
        print(f"      → {target_path.relative_to(ROOT)}")

        # Create target directory if needed
        target_path.parent.mkdir(parents=True, exist_ok=True)

        # Move the file
        shutil.move(str(css_path), str(target_path))
        moved_count += 1
        print("  ✅ Moved\n")

    return moved_count

def fix_component_imports():
    """Fix CSS import statements in components."""
    print("🔧 Fixing component CSS imports\n")

    fixed_count = 0
    for component_path, replacements in COMPONENT_IMPORTS_TO_FIX.items():
        file_path = ROOT / component_path

        if not file_path.exists():
            print(f"  ⚠️  Component not found: {file_path.relative_to(ROOT)}")
            continue

        content = file_path.read_text()
        old_import = replacements["old"]
        new_import = replacements["new"]

        if old_import in content:
            new_content = content.replace(old_import, new_import)
            file_path.write_text(new_content)
            print(f"  ✅ Fixed: {file_path.relative_to(ROOT)}")
            print(f"      {old_import}")
            print(f"    → {new_import}\n")
            fixed_count += 1
        else:
            print(f"  ℹ️  Already correct: {file_path.relative_to(ROOT)}\n")

    return fixed_count

def cleanup_empty_dirs():
    """Remove empty styles/styles/ directories."""
    print("🧹 Cleaning up empty directories\n")

    styles_styles_dir = ROOT / "frontend/features/dashboard/styles/styles"
    if styles_styles_dir.exists() and not any(styles_styles_dir.iterdir()):
        styles_styles_dir.rmdir()
        print(f"  ✅ Removed empty directory: {styles_styles_dir.relative_to(ROOT)}\n")
        return True
    else:
        print(f"  ℹ️  Directory not empty or doesn't exist\n")
        return False

def main():
    print("🎨 Fixing CSS file structure and import paths\n")
    print(f"Root directory: {ROOT}\n")
    print("=" * 60)

    # Step 1: Move CSS files
    moved = move_css_files()
    print("=" * 60)

    # Step 2: Fix component imports
    fixed = fix_component_imports()
    print("=" * 60)

    # Step 3: Cleanup
    cleanup_empty_dirs()
    print("=" * 60)

    print(f"✅ Moved {moved} CSS files")
    print(f"✅ Fixed {fixed} component imports")
    print("=" * 60)

if __name__ == "__main__":
    main()
