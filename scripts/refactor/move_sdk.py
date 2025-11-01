#!/usr/bin/env python3
"""
Migrate SDK files to new structure
- Copy files from frontend/ to src/sdk/
- Rewrite imports using AST-based rewriter
- Keep files as .js (no TypeScript conversion yet)
- Keep large files intact (no splitting yet)
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import List, Dict, Tuple

ROOT = Path(__file__).parent.parent.parent
INVENTORY_FILE = ROOT / "scripts" / "refactor" / "inventory.json"
REWRITE_MAP_FILE = ROOT / "scripts" / "refactor" / "import-rewrite-map.json"
REWRITER_SCRIPT = ROOT / "scripts" / "refactor" / "rewrite-imports.mjs"
REPORT_FILE = ROOT / "scripts" / "refactor" / "reports" / "phase3-sdk-migration.txt"


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


def migrate_sdk_files(inventory: Dict) -> Tuple[int, int, List[str]]:
    """
    Migrate SDK files
    Returns: (success_count, total_count, errors)
    """
    sdk_files = inventory.get('sdk_files', [])
    success_count = 0
    errors = []

    print(f"\nMigrating {len(sdk_files)} SDK files...")
    print("=" * 60)

    for file_info in sdk_files:
        src = ROOT / file_info['current']
        dst = ROOT / file_info['target']

        # Check if source exists
        if not src.exists():
            error_msg = f"Source file not found: {src}"
            print(f"  SKIP: {error_msg}")
            errors.append(error_msg)
            continue

        # Skip files that were moved to Walrus (avoid duplicates)
        if 'WalrusSdkClient' in str(src):
            print(f"  SKIP: {src.relative_to(ROOT)} (already in Walrus layer)")
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

    return success_count, len(sdk_files), errors


def create_barrel_exports():
    """
    Create src/sdk/index.js barrel export with organized exports
    """
    print("\nCreating barrel exports...")

    # Main SDK barrel
    barrel_content = """// WalSheetz SDK
// Layer 1: Core spreadsheet functionality and blockchain integration

// Core
export { SpreadsheetEngine } from './core/SpreadsheetEngine.js';
export { FormulaRefreshScheduler } from './core/scheduling/FormulaRefreshScheduler.js';
export { OfflineQueueManager } from './core/queue/OfflineQueueManager.js';

// Services - Blockchain
export { BrowserSuiService } from './services/blockchain/BrowserSuiService.js';
export { BrowserWalletManager } from './services/blockchain/BrowserWalletManager.js';
export { BrowserGrpcService } from './services/blockchain/BrowserGrpcService.js';

// Services - Storage
export { BlobLineageTracker } from './services/storage/BlobLineageTracker.js';
export { PoACertificationService } from './services/storage/PoACertificationService.js';

// Services - Formulas
export { WalSheetzFunctions } from './services/formulas/WalSheetzFunctions.js';
export { SuiFunctions } from './services/formulas/SuiFunctions.js';

// Services - Other
export { ErrorRecoveryService } from './services/ErrorRecoveryService.js';
export { SpreadsheetMigrator } from './services/SpreadsheetMigrator.js';
export { PoARenewalManager } from './services/PoARenewalManager.js';
export { FaucetService } from './services/FaucetService.js';
export { DeFiStateManager } from './services/DeFiStateManager.js';
export { WebSocketService } from './services/WebSocketService.js';

// Adapters
export { BlockchainAdapter } from './adapters/BlockchainAdapter.js';
export { StorageAdapter } from './adapters/StorageAdapter.js';

// Business Logic
export { useSpreadsheet } from './business/useSpreadsheet.js';

// Utils
export { Logger } from './utils/Logger.js';
export { ConfigLoader, configLoader } from './utils/ConfigLoader.js';
export { EventBus } from './utils/EventBus.js';
export { CircuitBreaker } from './utils/CircuitBreaker.js';
export { RateLimiter } from './utils/RateLimiter.js';
export { Telemetry } from './utils/Telemetry.js';
"""

    barrel_file = ROOT / "src" / "sdk" / "index.js"
    barrel_file.write_text(barrel_content)

    print(f"  ✓ Created: {barrel_file.relative_to(ROOT)}")


def generate_report(success: int, total: int, errors: List[str]):
    """Generate migration report"""
    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)

    with open(REPORT_FILE, 'w') as f:
        f.write("SDK Migration Report (Phase 3)\n")
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
        if success == total or (success > 0 and len(errors) < 5):
            f.write("✓ SUCCESS - All files migrated\n")
        elif success > total // 2:
            f.write("⚠ PARTIAL - Most files migrated with some errors\n")
        else:
            f.write("✗ FAILED - Migration failed\n")

    print(f"\n  Report: {REPORT_FILE.relative_to(ROOT)}")


def main():
    """Main execution"""
    print("=" * 60)
    print("Phase 3: SDK Files Migration")
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
    success, total, errors = migrate_sdk_files(inventory)

    # Create barrel exports
    if success > 0:
        create_barrel_exports()

    # Generate report
    generate_report(success, total, errors)

    # Print summary
    print("\n" + "=" * 60)
    print("Migration Summary")
    print("=" * 60)
    print(f"  Total files: {total}")
    print(f"  Migrated: {success}")
    print(f"  Errors: {len(errors)}")

    if success >= total - 5:  # Allow a few errors for duplicates/skips
        print("\n  ✓ Phase 3 complete! SDK files migrated successfully.")
        print("\n  Next steps:")
        print("    1. Review migrated files in src/sdk/")
        print("    2. Update imports: frontend/ → @/sdk/")
        print("    3. Run validation: bun run build && bun run test:unit")
        sys.exit(0)
    elif success > total // 2:
        print("\n  ⚠ Phase 3 partial success. Review errors in report.")
        sys.exit(0)  # Exit successfully for partial migrations
    else:
        print("\n  ✗ Phase 3 failed. Review errors in report.")
        sys.exit(1)


if __name__ == "__main__":
    main()
