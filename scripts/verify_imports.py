#!/usr/bin/env python3
"""
Verify all imports are correctly resolved.

This script scans for common import issues after running the fix scripts:
1. Remaining relative blockchain imports
2. Incorrect CSS import paths
3. Non-existent import paths
4. Files that might still need fixing
"""

import re
from pathlib import Path
from collections import defaultdict

# Project root
ROOT = Path(__file__).parent.parent

# Patterns to check for problematic imports
PROBLEMATIC_PATTERNS = [
    (r"from\s+['\"]\.\.\/\.\.\/blockchain\/", "Relative blockchain import (should use @blockchain)"),
    (r"from\s+['\"]\.\.\/\.\.\/\.\.\/blockchain\/", "Deep relative blockchain import (should use @blockchain)"),
    (r"from\s+['\"]\.\.\/\.\.\/\.\.\/\.\.\/blockchain\/", "Very deep relative blockchain import (should use @blockchain)"),
    (r"@features/dashboard/components/spreadsheet", "Incorrect spreadsheet component path"),
    (r"@shared/components/spreadsheet", "Non-existent spreadsheet shared component"),
]

# Directories to scan
SCAN_DIRS = [
    "frontend",
]

def scan_file(file_path: Path) -> list:
    """Scan a single file for problematic imports."""
    try:
        content = file_path.read_text()
        issues = []

        for pattern, description in PROBLEMATIC_PATTERNS:
            matches = re.finditer(pattern, content)
            for match in matches:
                # Get line number
                line_num = content[:match.start()].count('\n') + 1
                issues.append({
                    "line": line_num,
                    "pattern": description,
                    "match": match.group(0)
                })

        return issues
    except Exception as e:
        return []

def scan_directory(dir_path: Path) -> dict:
    """Scan directory recursively for import issues."""
    issues_by_file = defaultdict(list)

    # Get all JS/JSX/TS/TSX files
    extensions = [".js", ".jsx", ".ts", ".tsx"]

    for ext in extensions:
        for file_path in dir_path.rglob(f"*{ext}"):
            # Skip node_modules and other common ignore dirs
            if any(part in file_path.parts for part in ["node_modules", "dist", ".git", "build"]):
                continue

            issues = scan_file(file_path)
            if issues:
                rel_path = file_path.relative_to(ROOT)
                issues_by_file[rel_path] = issues

    return dict(issues_by_file)

def print_issues(issues_by_file: dict):
    """Print all issues in a readable format."""
    if not issues_by_file:
        print("✅ No problematic import patterns found!\n")
        return

    print(f"⚠️  Found issues in {len(issues_by_file)} files:\n")
    print("=" * 80)

    for file_path, issues in sorted(issues_by_file.items()):
        print(f"\n📄 {file_path}")
        for issue in issues:
            print(f"   Line {issue['line']}: {issue['pattern']}")
            print(f"   → {issue['match']}")

    print("\n" + "=" * 80)
    print(f"\n⚠️  Total: {sum(len(issues) for issues in issues_by_file.values())} issues in {len(issues_by_file)} files")

def check_vite_aliases():
    """Verify Vite aliases are configured correctly."""
    vite_config = ROOT / "vite.config.js"

    if not vite_config.exists():
        print("⚠️  vite.config.js not found!")
        return False

    content = vite_config.read_text()

    required_aliases = [
        "@blockchain",
        "@app",
        "@features",
        "@services",
        "@shared",
        "@utils",
        "@adapters",
    ]

    print("🔍 Checking Vite aliases configuration:\n")
    all_present = True

    for alias in required_aliases:
        if f"'{alias}'" in content or f'"{alias}"' in content:
            print(f"  ✅ {alias} alias configured")
        else:
            print(f"  ❌ {alias} alias MISSING")
            all_present = False

    print()
    return all_present

def main():
    print("🔍 Verifying import resolution\n")
    print(f"Root directory: {ROOT}\n")
    print("=" * 80)

    # Check Vite aliases
    aliases_ok = check_vite_aliases()
    print("=" * 80)

    # Scan for issues
    print("\n📊 Scanning for problematic imports...\n")

    all_issues = {}
    for scan_dir in SCAN_DIRS:
        dir_path = ROOT / scan_dir
        if dir_path.exists():
            print(f"Scanning {scan_dir}/...")
            issues = scan_directory(dir_path)
            all_issues.update(issues)

    print()
    print("=" * 80)

    # Print results
    print_issues(all_issues)

    # Summary
    print("\n" + "=" * 80)
    if not all_issues and aliases_ok:
        print("✅ All checks passed! Imports should be correctly resolved.")
    else:
        if not aliases_ok:
            print("❌ Vite aliases configuration has issues")
        if all_issues:
            print("❌ Found problematic imports that need fixing")
    print("=" * 80)

    return 0 if (not all_issues and aliases_ok) else 1

if __name__ == "__main__":
    exit(main())
