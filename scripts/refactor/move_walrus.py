#!/usr/bin/env python3
"""
Migrate Walrus files to new structure
- Copy files from frontend/services/walrus/ to src/walrus/
- Rewrite imports using AST-based rewriter
- Keep files as .js (no TypeScript conversion yet)
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import List, Dict

ROOT = Path(__file__).parent.parent.parent
INVENTORY_FILE = ROOT / "scripts" / "refactor" / "inventory.json"
REWRITE_MAP_FILE = ROOT / "scripts" / "refactor" / "import-rewrite-map.json"
REWRITER_SCRIPT = ROOT / "scripts" / "refactor" / "rewrite-imports.mjs"
REPORT_FILE = ROOT / "scripts" / "refactor" / "reports" / "phase2-walrus-migration.txt"


def load_inventory() -> Dict:
    """Load inventory.json"""
    with open(INVENTORY_FILE, 'r') as f:
        return json.load(f)


def copy_file(src: Path, dst: Path) -> bool:
    """
    Copy a file to destination
    Create parent directories if needed
    """
    try:
        # Ensure destination directory exists
        dst.parent.mkdir(parents=True, exist_ok=True)

        # Copy file preserving metadata
        shutil.copy2(src, dst)

        print(f"  COPY: {src.relative_to(ROOT)} → {dst.relative_to(ROOT)}")
        return True

    except Exception as e:
        print(f"  ERROR copying {src}: {e}")
        return False


def rewrite_imports(file_path: Path) -> bool:
    """
    Rewrite imports in a file using AST-based rewriter
    Returns True if successful, False otherwise
    """
    try:
        result = subprocess.run(
            ['node', str(REWRITER_SCRIPT), str(file_path), str(REWRITE_MAP_FILE)],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode == 0:
            # Check if file was actually modified
            if "Rewrote imports" in result.stdout:
                print(f"  REWRITE: {file_path.relative_to(ROOT)}")
                return True
            else:
                # No changes needed, but not an error
                return True
        else:
            print(f"  ERROR rewriting {file_path}:")
            print(f"    {result.stderr}")
            return False

    except subprocess.TimeoutExpired:
        print(f"  ERROR: Timeout rewriting {file_path}")
        return False
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def migrate_walrus_files(inventory: Dict) -> tuple[int, int, List[str]]:
    """
    Migrate Walrus files
    Returns: (success_count, total_count, errors)
    """
    walrus_files = inventory.get('walrus_files', [])
    success_count = 0
    errors = []

    print(f"\nMigrating {len(walrus_files)} Walrus files...")
    print("=" * 60)

    for file_info in walrus_files:
        src = ROOT / file_info['current']
        dst = ROOT / file_info['target']

        # Check if source exists
        if not src.exists():
            error_msg = f"Source file not found: {src}"
            print(f"  SKIP: {error_msg}")
            errors.append(error_msg)
            continue

        # Copy file
        if not copy_file(src, dst):
            errors.append(f"Failed to copy {src}")
            continue

        # Rewrite imports
        if not rewrite_imports(dst):
            errors.append(f"Failed to rewrite imports in {dst}")
            # Don't count as success if rewrite failed
            continue

        success_count += 1

    return success_count, len(walrus_files), errors


def create_barrel_export():
    """
    Create src/walrus/index.js barrel export
    """
    print("\nCreating barrel export...")

    barrel_content = """// Walrus Storage Client
// Layer 2: Decentralized storage adapter

// Client
export { WalrusBlobClient } from './client/WalrusBlobClient.js';
export { WalrusConnectionManager } from './client/WalrusConnectionManager.js';

// Config
export { WalrusConfigResolver } from './config/WalrusConfigResolver.js';

// Health
export { HealthMonitor } from './health/HealthMonitor.js';

// Retry
export { RetryQueue } from './retry/RetryQueue.js';

// Transports
export { Transport } from './transports/Transport.js';
export { DirectTransport } from './transports/DirectTransport.js';
export { ProxyTransport } from './transports/ProxyTransport.js';

// Browser services
export { default as BrowserWalrusService } from './BrowserWalrusService.js';
export { WalrusSdkClient } from './WalrusSdkClient.js';
export { WalrusSdkClientLoader } from './WalrusSdkClientLoader.js';
"""

    barrel_file = ROOT / "src" / "walrus" / "index.js"
    barrel_file.write_text(barrel_content)

    print(f"  ✓ Created: {barrel_file.relative_to(ROOT)}")


def generate_report(success: int, total: int, errors: List[str]):
    """Generate migration report"""
    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)

    with open(REPORT_FILE, 'w') as f:
        f.write("Walrus Migration Report (Phase 2)\n")
        f.write("=" * 60 + "\n\n")

        f.write(f"Total files: {total}\n")
        f.write(f"Successfully migrated: {success}\n")
        f.write(f"Errors: {len(errors)}\n\n")

        if errors:
            f.write("Errors:\n")
            f.write("-" * 60 + "\n")
            for error in errors:
                f.write(f"  - {error}\n")
            f.write("\n")

        f.write("Status: ")
        if success == total:
            f.write("✓ SUCCESS - All files migrated\n")
        elif success > 0:
            f.write("⚠ PARTIAL - Some files migrated with errors\n")
        else:
            f.write("✗ FAILED - Migration failed\n")

    print(f"\n  Report: {REPORT_FILE.relative_to(ROOT)}")


def main():
    """Main execution"""
    print("=" * 60)
    print("Phase 2: Walrus Files Migration")
    print("=" * 60)

    # Load inventory
    print("\nLoading inventory...")
    try:
        inventory = load_inventory()
        print(f"  ✓ Loaded {INVENTORY_FILE.relative_to(ROOT)}")
    except Exception as e:
        print(f"  ✗ Error loading inventory: {e}")
        sys.exit(1)

    # Migrate files
    success, total, errors = migrate_walrus_files(inventory)

    # Create barrel export
    if success > 0:
        create_barrel_export()

    # Generate report
    generate_report(success, total, errors)

    # Print summary
    print("\n" + "=" * 60)
    print("Migration Summary")
    print("=" * 60)
    print(f"  Total files: {total}")
    print(f"  Migrated: {success}")
    print(f"  Errors: {len(errors)}")

    if success == total:
        print("\n  ✓ Phase 2 complete! All Walrus files migrated successfully.")
        print("\n  Next steps:")
        print("    1. Review migrated files in src/walrus/")
        print("    2. Run validation: bun run test:walrus")
        print("    3. Run build: bun run build")
        sys.exit(0)
    elif success > 0:
        print("\n  ⚠ Phase 2 partial success. Review errors in report.")
        sys.exit(1)
    else:
        print("\n  ✗ Phase 2 failed. Review errors in report.")
        sys.exit(1)


if __name__ == "__main__":
    main()
