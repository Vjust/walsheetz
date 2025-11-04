#!/usr/bin/env python3
"""
Scan repository and create inventory for migration
Output: inventory.json with file mappings
"""

import json
import os
import re
from pathlib import Path
from datetime import datetime
from typing import List, Dict

ROOT = Path(__file__).parent.parent.parent
FRONTEND_DIR = ROOT / "frontend"
OUTPUT_FILE = ROOT / "scripts" / "refactor" / "inventory.json"


def extract_imports(file_path: Path) -> List[str]:
    """Extract import statements from a JS/JSX/TS file"""
    if not file_path.exists():
        return []

    try:
        content = file_path.read_text(encoding='utf-8')
        imports = []

        # Match import from statements
        import_pattern = r"""import\s+.*?\s+from\s+['"]([^'"]+)['"]"""
        imports.extend(re.findall(import_pattern, content))

        # Match require statements
        require_pattern = r"""require\s*\(\s*['"]([^'"]+)['"]\s*\)"""
        imports.extend(re.findall(require_pattern, content))

        # Match dynamic imports
        dynamic_pattern = r"""import\s*\(\s*['"]([^'"]+)['"]\s*\)"""
        imports.extend(re.findall(dynamic_pattern, content))

        # Return unique imports (first 10 to keep JSON size reasonable)
        return list(dict.fromkeys(imports))[:10]

    except Exception as e:
        print(f"Warning: Could not read {file_path}: {e}")
        return []


def get_file_size(file_path: Path) -> int:
    """Get file size in bytes"""
    try:
        return file_path.stat().st_size
    except:
        return 0


def scan_walrus_files() -> List[Dict]:
    """Scan Walrus-related files"""
    files = []

    # Scan frontend/services/walrus/
    walrus_dir = FRONTEND_DIR / "services" / "walrus"
    if walrus_dir.exists():
        for file_path in walrus_dir.rglob("*.js"):
            rel_path = file_path.relative_to(walrus_dir)
            files.append({
                "current": str(file_path.relative_to(ROOT)).replace('\\', '/'),
                "target": f"src/walrus/{str(rel_path).replace(chr(92), '/')}",
                "size": get_file_size(file_path),
                "imports": extract_imports(file_path)
            })

        for file_path in walrus_dir.rglob("*.jsx"):
            rel_path = file_path.relative_to(walrus_dir)
            files.append({
                "current": str(file_path.relative_to(ROOT)).replace('\\', '/'),
                "target": f"src/walrus/{str(rel_path).replace(chr(92), '/')}",
                "size": get_file_size(file_path),
                "imports": extract_imports(file_path)
            })

    # Scan for BrowserWalrusService and related
    services_dir = FRONTEND_DIR / "services"
    if services_dir.exists():
        for pattern in ["*Walrus*.js", "*Walrus*.jsx"]:
            for file_path in services_dir.glob(pattern):
                if file_path.is_file():
                    filename = file_path.name
                    files.append({
                        "current": str(file_path.relative_to(ROOT)).replace('\\', '/'),
                        "target": f"src/walrus/{filename}",
                        "size": get_file_size(file_path),
                        "imports": extract_imports(file_path)
                    })

    return files


def scan_sdk_files() -> List[Dict]:
    """Scan SDK-related files (core, services, adapters, business, utils)"""
    files = []

    # Core files
    core_dir = FRONTEND_DIR / "core"
    if core_dir.exists():
        for ext in ["*.js", "*.jsx"]:
            for file_path in core_dir.rglob(ext):
                rel_path = file_path.relative_to(core_dir)
                files.append({
                    "current": str(file_path.relative_to(ROOT)).replace('\\', '/'),
                    "target": f"src/sdk/core/{str(rel_path).replace(chr(92), '/')}",
                    "size": get_file_size(file_path),
                    "type": "core",
                    "imports": extract_imports(file_path)
                })

    # Services (excluding walrus and luckysheet)
    services_dir = FRONTEND_DIR / "services"
    if services_dir.exists():
        for ext in ["*.js", "*.jsx"]:
            for file_path in services_dir.rglob(ext):
                # Skip walrus and luckysheet
                rel_str = str(file_path.relative_to(services_dir))
                if rel_str.startswith('walrus') or rel_str.startswith('luckysheet'):
                    continue

                # Determine target path
                if 'blockchain' in str(file_path):
                    target = f"src/sdk/services/{str(file_path.relative_to(services_dir)).replace(chr(92), '/')}"
                elif 'formulas' in str(file_path):
                    target = f"src/sdk/services/{str(file_path.relative_to(services_dir)).replace(chr(92), '/')}"
                elif 'testing' in str(file_path):
                    target = f"src/sdk/services/{str(file_path.relative_to(services_dir)).replace(chr(92), '/')}"
                elif file_path.name.startswith('Browser') and any(x in file_path.name for x in ['Sui', 'Wallet', 'Grpc', 'Blockchain']):
                    target = f"src/sdk/services/blockchain/{file_path.name}"
                else:
                    target = f"src/sdk/services/{file_path.name}"

                files.append({
                    "current": str(file_path.relative_to(ROOT)).replace('\\', '/'),
                    "target": target,
                    "size": get_file_size(file_path),
                    "type": "service",
                    "imports": extract_imports(file_path)
                })

    # Adapters
    adapters_dir = FRONTEND_DIR / "adapters"
    if adapters_dir.exists():
        for ext in ["*.js", "*.jsx"]:
            for file_path in adapters_dir.rglob(ext):
                rel_path = file_path.relative_to(adapters_dir)
                rel_str = str(rel_path).replace(chr(92), '/')

                # Determine target
                if 'atomicOperations' in str(file_path):
                    target = f"src/sdk/adapters/atomic/{str(rel_path).split('atomicOperations/')[-1]}"
                elif 'BlockchainAdapter' in file_path.name:
                    target = "src/sdk/adapters/BlockchainAdapter.js"
                elif 'StorageAdapter' in file_path.name:
                    target = "src/sdk/adapters/storage/StorageAdapter.js"
                else:
                    target = f"src/sdk/adapters/{rel_str}"

                files.append({
                    "current": str(file_path.relative_to(ROOT)).replace('\\', '/'),
                    "target": target,
                    "size": get_file_size(file_path),
                    "type": "adapter",
                    "imports": extract_imports(file_path)
                })

    # Business logic
    business_dir = FRONTEND_DIR / "business"
    if business_dir.exists():
        for ext in ["*.js", "*.jsx"]:
            for file_path in business_dir.rglob(ext):
                rel_path = file_path.relative_to(business_dir)
                rel_str = str(rel_path).replace(chr(92), '/')

                # Ensure hooks/ prefix if not present
                if not rel_str.startswith('hooks/'):
                    target = f"src/sdk/business/hooks/{rel_str}"
                else:
                    target = f"src/sdk/business/{rel_str}"

                files.append({
                    "current": str(file_path.relative_to(ROOT)).replace('\\', '/'),
                    "target": target,
                    "size": get_file_size(file_path),
                    "type": "business",
                    "imports": extract_imports(file_path)
                })

    # Interfaces
    interfaces_dir = FRONTEND_DIR / "interfaces"
    if interfaces_dir.exists():
        for ext in ["*.js", "*.jsx", "*.ts", "*.tsx"]:
            for file_path in interfaces_dir.rglob(ext):
                rel_path = file_path.relative_to(interfaces_dir)
                files.append({
                    "current": str(file_path.relative_to(ROOT)).replace('\\', '/'),
                    "target": f"src/sdk/interfaces/{str(rel_path).replace(chr(92), '/')}",
                    "size": get_file_size(file_path),
                    "type": "interface",
                    "imports": extract_imports(file_path)
                })

    # Types
    types_dir = FRONTEND_DIR / "types"
    if types_dir.exists():
        for ext in ["*.ts", "*.d.ts", "*.json"]:
            for file_path in types_dir.rglob(ext):
                rel_path = file_path.relative_to(types_dir)
                files.append({
                    "current": str(file_path.relative_to(ROOT)).replace('\\', '/'),
                    "target": f"src/sdk/types/{str(rel_path).replace(chr(92), '/')}",
                    "size": get_file_size(file_path),
                    "type": "type",
                    "imports": []
                })

    # Utils
    utils_dir = FRONTEND_DIR / "utils"
    if utils_dir.exists():
        for ext in ["*.js", "*.jsx"]:
            for file_path in utils_dir.rglob(ext):
                rel_path = file_path.relative_to(utils_dir)
                files.append({
                    "current": str(file_path.relative_to(ROOT)).replace('\\', '/'),
                    "target": f"src/sdk/utils/{str(rel_path).replace(chr(92), '/')}",
                    "size": get_file_size(file_path),
                    "type": "util",
                    "imports": extract_imports(file_path)
                })

    return files


def scan_web_files() -> List[Dict]:
    """Scan Web UI files"""
    files = []

    # Main entry point
    main_file = FRONTEND_DIR / "main.jsx"
    if main_file.exists():
        files.append({
            "current": str(main_file.relative_to(ROOT)).replace('\\', '/'),
            "target": "web/main.jsx",
            "size": get_file_size(main_file),
            "type": "entry",
            "imports": extract_imports(main_file)
        })

    # Presentation App
    app_file = FRONTEND_DIR / "presentation" / "App.jsx"
    if app_file.exists():
        files.append({
            "current": str(app_file.relative_to(ROOT)).replace('\\', '/'),
            "target": "web/App.jsx",
            "size": get_file_size(app_file),
            "type": "app",
            "imports": extract_imports(app_file)
        })

    # Components (presentation)
    pres_components = FRONTEND_DIR / "presentation" / "components"
    if pres_components.exists():
        for ext in ["*.jsx", "*.js"]:
            for file_path in pres_components.rglob(ext):
                rel_path = file_path.relative_to(pres_components)
                files.append({
                    "current": str(file_path.relative_to(ROOT)).replace('\\', '/'),
                    "target": f"web/components/{str(rel_path).replace(chr(92), '/')}",
                    "size": get_file_size(file_path),
                    "type": "component",
                    "source": "presentation",
                    "imports": extract_imports(file_path)
                })

    # Components (legacy)
    legacy_components = FRONTEND_DIR / "components"
    if legacy_components.exists():
        for ext in ["*.jsx", "*.js"]:
            for file_path in legacy_components.rglob(ext):
                rel_path = file_path.relative_to(legacy_components)
                files.append({
                    "current": str(file_path.relative_to(ROOT)).replace('\\', '/'),
                    "target": f"web/components/{str(rel_path).replace(chr(92), '/')}",
                    "size": get_file_size(file_path),
                    "type": "component",
                    "source": "legacy",
                    "imports": extract_imports(file_path)
                })

    # Pages (presentation)
    pres_pages = FRONTEND_DIR / "presentation" / "pages"
    if pres_pages.exists():
        for ext in ["*.jsx", "*.js"]:
            for file_path in pres_pages.rglob(ext):
                rel_path = file_path.relative_to(pres_pages)
                files.append({
                    "current": str(file_path.relative_to(ROOT)).replace('\\', '/'),
                    "target": f"web/pages/{str(rel_path).replace(chr(92), '/')}",
                    "size": get_file_size(file_path),
                    "type": "page",
                    "source": "presentation",
                    "imports": extract_imports(file_path)
                })

    # Pages (legacy)
    legacy_pages = FRONTEND_DIR / "pages"
    if legacy_pages.exists():
        for ext in ["*.jsx", "*.js"]:
            for file_path in legacy_pages.rglob(ext):
                rel_path = file_path.relative_to(legacy_pages)
                files.append({
                    "current": str(file_path.relative_to(ROOT)).replace('\\', '/'),
                    "target": f"web/pages/{str(rel_path).replace(chr(92), '/')}",
                    "size": get_file_size(file_path),
                    "type": "page",
                    "source": "legacy",
                    "imports": extract_imports(file_path)
                })

    # Providers
    providers_dir = FRONTEND_DIR / "providers"
    if providers_dir.exists():
        for ext in ["*.jsx", "*.js"]:
            for file_path in providers_dir.rglob(ext):
                rel_path = file_path.relative_to(providers_dir)
                files.append({
                    "current": str(file_path.relative_to(ROOT)).replace('\\', '/'),
                    "target": f"web/providers/{str(rel_path).replace(chr(92), '/')}",
                    "size": get_file_size(file_path),
                    "type": "provider",
                    "imports": extract_imports(file_path)
                })

    # Hooks (presentation)
    pres_hooks = FRONTEND_DIR / "presentation" / "hooks"
    if pres_hooks.exists():
        for ext in ["*.js", "*.jsx", "*.ts", "*.tsx"]:
            for file_path in pres_hooks.rglob(ext):
                rel_path = file_path.relative_to(pres_hooks)
                files.append({
                    "current": str(file_path.relative_to(ROOT)).replace('\\', '/'),
                    "target": f"web/hooks/{str(rel_path).replace(chr(92), '/')}",
                    "size": get_file_size(file_path),
                    "type": "hook",
                    "imports": extract_imports(file_path)
                })

    # Hooks (top-level wallet hooks)
    hooks_dir = FRONTEND_DIR / "hooks"
    if hooks_dir.exists():
        for ext in ["*.ts", "*.tsx"]:
            for file_path in hooks_dir.glob(ext):
                if file_path.is_file():
                    files.append({
                        "current": str(file_path.relative_to(ROOT)).replace('\\', '/'),
                        "target": f"web/hooks/{file_path.name}",
                        "size": get_file_size(file_path),
                        "type": "hook",
                        "imports": extract_imports(file_path)
                    })

    # Luckysheet services
    luckysheet_dir = FRONTEND_DIR / "services" / "luckysheet"
    if luckysheet_dir.exists():
        for ext in ["*.js", "*.jsx"]:
            for file_path in luckysheet_dir.rglob(ext):
                rel_path = file_path.relative_to(luckysheet_dir)
                files.append({
                    "current": str(file_path.relative_to(ROOT)).replace('\\', '/'),
                    "target": f"web/services/luckysheet/{str(rel_path).replace(chr(92), '/')}",
                    "size": get_file_size(file_path),
                    "type": "service",
                    "imports": extract_imports(file_path)
                })

    # Styles
    styles_dir = FRONTEND_DIR / "presentation" / "styles"
    if styles_dir.exists():
        for file_path in styles_dir.rglob("*.css"):
            rel_path = file_path.relative_to(styles_dir)
            files.append({
                "current": str(file_path.relative_to(ROOT)).replace('\\', '/'),
                "target": f"web/styles/{str(rel_path).replace(chr(92), '/')}",
                "size": get_file_size(file_path),
                "type": "style",
                "imports": []
            })

    return files


def main():
    """Main execution"""
    print("Scanning repository for migration inventory...")

    inventory = {
        "scan_date": datetime.utcnow().isoformat() + "Z",
        "walrus_files": scan_walrus_files(),
        "sdk_files": scan_sdk_files(),
        "web_files": scan_web_files()
    }

    # Save inventory
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(inventory, f, indent=2)

    print(f"\nInventory scan complete: {OUTPUT_FILE}")
    print("\nSummary:")
    print(f"  Walrus files: {len(inventory['walrus_files'])}")
    print(f"  SDK files: {len(inventory['sdk_files'])}")
    print(f"  Web files: {len(inventory['web_files'])}")
    print(f"  Total: {len(inventory['walrus_files']) + len(inventory['sdk_files']) + len(inventory['web_files'])}")


if __name__ == "__main__":
    main()
