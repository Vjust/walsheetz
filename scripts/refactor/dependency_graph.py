#!/usr/bin/env python3
"""
Dependency Graph Analyzer
Creates import dependency graph and rewrite map for migration
"""

import json
import re
import os
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Set, Tuple

ROOT = Path(__file__).parent.parent.parent
FRONTEND_DIR = ROOT / "frontend"
OUTPUT_DIR = ROOT / "scripts" / "refactor"


def extract_imports(file_path: Path) -> List[str]:
    """Extract import statements from a JS/JSX/TS file"""
    imports = []

    try:
        content = file_path.read_text(encoding='utf-8')

        # Match import statements
        # import ... from "..."
        # import ... from '...'
        import_pattern = r"""import\s+.*?\s+from\s+['"]([^'"]+)['"]"""
        imports.extend(re.findall(import_pattern, content))

        # Match require statements
        # const ... = require("...")
        # const ... = require('...')
        require_pattern = r"""require\s*\(\s*['"]([^'"]+)['"]\s*\)"""
        imports.extend(re.findall(require_pattern, content))

        # Match dynamic imports
        # import("...")
        # import('...')
        dynamic_pattern = r"""import\s*\(\s*['"]([^'"]+)['"]\s*\)"""
        imports.extend(re.findall(dynamic_pattern, content))

    except Exception as e:
        print(f"Warning: Could not read {file_path}: {e}")

    return imports


def normalize_import_path(import_path: str, from_file: Path) -> str:
    """Normalize relative import to absolute project path"""
    if not import_path.startswith('.'):
        # Absolute or node_modules import
        return import_path

    # Resolve relative path
    from_dir = from_file.parent
    resolved = (from_dir / import_path).resolve()

    # Convert to relative to project root
    try:
        rel_path = resolved.relative_to(ROOT)
        return str(rel_path).replace('\\', '/')
    except ValueError:
        # Path is outside project
        return import_path


def build_dependency_graph() -> Dict[str, List[str]]:
    """Build dependency graph of all frontend files"""
    graph = defaultdict(list)

    # Find all JS/JSX/TS files in frontend
    extensions = ['*.js', '*.jsx', '*.ts', '*.tsx']
    files = []
    for ext in extensions:
        files.extend(FRONTEND_DIR.rglob(ext))

    for file_path in files:
        imports = extract_imports(file_path)
        rel_file = file_path.relative_to(ROOT)

        for import_path in imports:
            normalized = normalize_import_path(import_path, file_path)
            # Remove .js, .jsx, .ts, .tsx extensions
            normalized = re.sub(r'\.(js|jsx|ts|tsx)$', '', normalized)
            graph[str(rel_file)].append(normalized)

    return graph


def detect_cycles(graph: Dict[str, List[str]]) -> List[List[str]]:
    """Detect circular dependencies using DFS"""
    cycles = []
    visited = set()
    rec_stack = set()

    def dfs(node: str, path: List[str]):
        if node in rec_stack:
            # Found a cycle
            cycle_start = path.index(node)
            cycles.append(path[cycle_start:] + [node])
            return

        if node in visited:
            return

        visited.add(node)
        rec_stack.add(node)

        for neighbor in graph.get(node, []):
            # Only consider frontend files
            if neighbor.startswith('frontend/'):
                dfs(neighbor, path + [node])

        rec_stack.remove(node)

    for node in graph:
        if node not in visited:
            dfs(node, [])

    return cycles


def generate_import_rewrite_map() -> Dict:
    """Generate import rewrite rules for migration"""

    # Priority determines order of matching (lower number = higher priority)
    patterns = [
        {
            "name": "Fix doubled src/walrus/walrus path",
            "from_regex": "^src/walrus/walrus/",
            "to_alias": "@/walrus/",
            "priority": -1,
            "description": "Remove doubled walrus directory from imports"
        },
        {
            "name": "src/walrus (already migrated)",
            "from_regex": "^src/walrus/",
            "to_alias": "@/walrus/",
            "priority": 0,
            "description": "Internal Walrus imports (post-migration)"
        },
        {
            "name": "src/sdk (already migrated)",
            "from_regex": "^src/sdk/",
            "to_alias": "@/sdk/",
            "priority": 0,
            "description": "Internal SDK imports (post-migration)"
        },
        {
            "name": "src/utils shorthand",
            "from_regex": "^src/utils/",
            "to_alias": "@/sdk/utils/",
            "priority": 0,
            "description": "Utils imports from migrated files"
        },
        {
            "name": "Blockchain directory",
            "from_regex": "^blockchain/",
            "to_alias": "@/blockchain/",
            "priority": 0,
            "description": "Blockchain service imports"
        },
        {
            "name": "Walrus services (specific)",
            "from_regex": "^frontend/services/walrus/",
            "to_alias": "@/walrus/",
            "priority": 1,
            "description": "Walrus storage client modules"
        },
        {
            "name": "Browser Walrus services",
            "from_regex": "^frontend/services/(BrowserWalrusService|WalrusSdkClient|WalrusSdkClientLoader)",
            "to_alias": "@/walrus/",
            "priority": 2,
            "description": "Browser-compatible Walrus services"
        },
        {
            "name": "Core engine",
            "from_regex": "^frontend/core/",
            "to_alias": "@/sdk/core/",
            "priority": 3,
            "description": "Core spreadsheet engine and infrastructure"
        },
        {
            "name": "Blockchain services",
            "from_regex": "^frontend/services/blockchain/",
            "to_alias": "@/sdk/services/blockchain/",
            "priority": 4,
            "description": "Blockchain service modules"
        },
        {
            "name": "Browser blockchain services",
            "from_regex": "^frontend/services/(BrowserSuiService|BrowserWalletManager|BrowserGrpcService)",
            "to_alias": "@/sdk/services/blockchain/",
            "priority": 5,
            "description": "Browser-compatible blockchain services"
        },
        {
            "name": "Formula services",
            "from_regex": "^frontend/services/formulas/",
            "to_alias": "@/sdk/services/formulas/",
            "priority": 6,
            "description": "Formula functions and calculations"
        },
        {
            "name": "Testing services",
            "from_regex": "^frontend/services/testing/",
            "to_alias": "@/sdk/services/testing/",
            "priority": 7,
            "description": "Test mode adapters"
        },
        {
            "name": "Generic services",
            "from_regex": "^frontend/services/",
            "to_alias": "@/sdk/services/",
            "priority": 8,
            "description": "Other service modules"
        },
        {
            "name": "Blockchain adapter",
            "from_regex": "^frontend/adapters/BlockchainAdapter",
            "to_alias": "@/sdk/adapters/",
            "priority": 9,
            "description": "Main blockchain adapter"
        },
        {
            "name": "Storage adapter",
            "from_regex": "^frontend/adapters/StorageAdapter",
            "to_alias": "@/sdk/adapters/storage/",
            "priority": 10,
            "description": "Storage adapter"
        },
        {
            "name": "Atomic operations",
            "from_regex": "^frontend/adapters/atomicOperations/",
            "to_alias": "@/sdk/adapters/atomic/",
            "priority": 11,
            "description": "Atomic transaction operations"
        },
        {
            "name": "Generic adapters",
            "from_regex": "^frontend/adapters/",
            "to_alias": "@/sdk/adapters/",
            "priority": 12,
            "description": "Other adapters"
        },
        {
            "name": "Business hooks",
            "from_regex": "^frontend/business/",
            "to_alias": "@/sdk/business/",
            "priority": 13,
            "description": "Business logic hooks"
        },
        {
            "name": "Interfaces",
            "from_regex": "^frontend/interfaces/",
            "to_alias": "@/sdk/interfaces/",
            "priority": 14,
            "description": "Interface definitions"
        },
        {
            "name": "Types",
            "from_regex": "^frontend/types/",
            "to_alias": "@/sdk/types/",
            "priority": 15,
            "description": "Type definitions"
        },
        {
            "name": "Utils",
            "from_regex": "^frontend/utils/",
            "to_alias": "@/sdk/utils/",
            "priority": 16,
            "description": "Utility functions"
        },
        {
            "name": "Presentation components",
            "from_regex": "^frontend/presentation/components/",
            "to_alias": "@/web/components/",
            "priority": 17,
            "description": "React components (presentation layer)"
        },
        {
            "name": "Legacy components",
            "from_regex": "^frontend/components/",
            "to_alias": "@/web/components/",
            "priority": 18,
            "description": "React components (legacy)"
        },
        {
            "name": "Presentation pages",
            "from_regex": "^frontend/presentation/pages/",
            "to_alias": "@/web/pages/",
            "priority": 19,
            "description": "Page components (presentation layer)"
        },
        {
            "name": "Legacy pages",
            "from_regex": "^frontend/pages/",
            "to_alias": "@/web/pages/",
            "priority": 20,
            "description": "Page components (legacy)"
        },
        {
            "name": "Providers",
            "from_regex": "^frontend/providers/",
            "to_alias": "@/web/providers/",
            "priority": 21,
            "description": "React context providers"
        },
        {
            "name": "Presentation hooks",
            "from_regex": "^frontend/presentation/hooks/",
            "to_alias": "@/web/hooks/",
            "priority": 22,
            "description": "Presentation layer hooks"
        },
        {
            "name": "Wallet hooks",
            "from_regex": "^frontend/hooks/",
            "to_alias": "@/web/hooks/",
            "priority": 23,
            "description": "Wallet connection hooks"
        },
        {
            "name": "Luckysheet services",
            "from_regex": "^frontend/services/luckysheet/",
            "to_alias": "@/web/services/luckysheet/",
            "priority": 24,
            "description": "Luckysheet adapter services"
        },
        {
            "name": "Styles",
            "from_regex": "^frontend/presentation/styles/",
            "to_alias": "@/web/styles/",
            "priority": 25,
            "description": "CSS styles"
        }
    ]

    return {
        "version": "1.0",
        "patterns": patterns
    }


def main():
    """Main execution"""
    print("Analyzing dependencies...")

    # Build dependency graph
    graph = build_dependency_graph()

    # Detect cycles
    print("Detecting circular dependencies...")
    cycles = detect_cycles(graph)

    # Generate rewrite map
    print("Generating import rewrite map...")
    rewrite_map = generate_import_rewrite_map()

    # Save dependency graph
    dep_graph_file = OUTPUT_DIR / "dependency-graph.json"
    with open(dep_graph_file, 'w') as f:
        json.dump({
            "graph": {k: v for k, v in graph.items() if k.startswith('frontend/')},
            "stats": {
                "total_files": len([k for k in graph.keys() if k.startswith('frontend/')]),
                "total_imports": sum(len(v) for k, v in graph.items() if k.startswith('frontend/')),
                "cycles_detected": len(cycles)
            }
        }, f, indent=2)

    print(f"  Saved: {dep_graph_file}")

    # Save rewrite map
    rewrite_map_file = OUTPUT_DIR / "import-rewrite-map.json"
    with open(rewrite_map_file, 'w') as f:
        json.dump(rewrite_map, f, indent=2)

    print(f"  Saved: {rewrite_map_file}")

    # Save cycle warnings
    if cycles:
        cycles_file = OUTPUT_DIR / "reports" / "cycle-warnings.txt"
        cycles_file.parent.mkdir(parents=True, exist_ok=True)

        with open(cycles_file, 'w') as f:
            f.write(f"Circular Dependencies Detected: {len(cycles)}\n\n")
            for i, cycle in enumerate(cycles, 1):
                f.write(f"Cycle {i}:\n")
                for node in cycle:
                    f.write(f"  → {node}\n")
                f.write("\n")

        print(f"  WARNING: {len(cycles)} circular dependencies detected")
        print(f"  Review: {cycles_file}")
    else:
        print("  No circular dependencies detected ✓")

    print("\nDependency analysis complete!")
    print(f"  Total files analyzed: {len([k for k in graph.keys() if k.startswith('frontend/')])}")
    print(f"  Total import statements: {sum(len(v) for k, v in graph.items() if k.startswith('frontend/'))}")
    print(f"  Rewrite patterns: {len(rewrite_map['patterns'])}")


if __name__ == "__main__":
    main()
