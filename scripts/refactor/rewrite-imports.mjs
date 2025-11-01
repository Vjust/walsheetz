#!/usr/bin/env node
/**
 * AST-based import rewriter
 * Safely rewrites import statements using Babel parser
 * Handles:
 * - import ... from "..."
 * - require("...")
 * - dynamic import("...")
 * - All quote styles (single, double)
 * - Deep relative paths (../../..)
 * - .js, .jsx, .ts, .tsx extensions
 */

import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Apply rewrite rules to an import path
 * @param {string} importPath - The import path to rewrite
 * @param {Array} patterns - Rewrite patterns sorted by priority
 * @param {string} currentFilePath - Path of the file being processed
 * @returns {string} - Rewritten import path or original if no match
 */
function applyRewriteRules(importPath, patterns, currentFilePath) {
  // Don't rewrite node_modules imports or absolute paths
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return importPath;
  }

  // Resolve relative imports to project-relative path
  let absolutePath = importPath;

  if (importPath.startsWith('.')) {
    const currentDir = path.dirname(currentFilePath);
    const resolved = path.resolve(currentDir, importPath);
    const projectRoot = path.resolve(__dirname, '..', '..');

    try {
      absolutePath = path.relative(projectRoot, resolved);
      // Normalize to forward slashes
      absolutePath = absolutePath.replace(/\\/g, '/');
    } catch (e) {
      // Path is outside project, return original
      return importPath;
    }
  }

  // Remove file extension for matching
  const cleanPath = absolutePath.replace(/\.(js|jsx|ts|tsx)$/, '');

  // Apply rewrite rules by priority (lower number = higher priority)
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.from_regex);

    if (regex.test(cleanPath)) {
      const newPath = cleanPath.replace(regex, pattern.to_alias);

      // Determine if we should preserve or add .js extension
      const hasExtension = /\.(js|jsx|ts|tsx)$/.test(importPath);
      const originalExt = importPath.match(/\.(js|jsx|ts|tsx)$/)?.[0] || '';

      // For @ alias imports, keep .js extension to avoid resolution issues
      if (hasExtension) {
        return newPath + originalExt;
      } else {
        return newPath + '.js';
      }
    }
  }

  // No match, return original
  return importPath;
}

/**
 * Rewrite imports in a file using AST transformation
 * @param {string} filePath - Path to the file to rewrite
 * @param {Object} rewriteMap - Rewrite configuration with patterns
 * @returns {boolean} - True if file was modified
 */
function rewriteImports(filePath, rewriteMap) {
  // Read file content
  const code = fs.readFileSync(filePath, 'utf-8');

  // Determine file type for parser
  const isTypeScript = /\.tsx?$/.test(filePath);
  const isJSX = /\.jsx$/.test(filePath);

  // Parse with Babel
  let ast;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'classProperties',
        'dynamicImport',
        'exportDefaultFrom',
        'exportNamespaceFrom',
        ...(isTypeScript ? ['typescript'] : [])
      ]
    });
  } catch (parseError) {
    console.error(`Parse error in ${filePath}:`);
    console.error(parseError.message);
    return false;
  }

  let modified = false;
  const patterns = rewriteMap.patterns.sort((a, b) => a.priority - b.priority);

  // Traverse AST and rewrite import statements
  traverse.default(ast, {
    // Handle: import ... from "..."
    ImportDeclaration(path) {
      const source = path.node.source.value;
      const newSource = applyRewriteRules(source, patterns, filePath);

      if (newSource !== source) {
        path.node.source.value = newSource;
        modified = true;
      }
    },

    // Handle: export ... from "..."
    ExportNamedDeclaration(path) {
      if (path.node.source) {
        const source = path.node.source.value;
        const newSource = applyRewriteRules(source, patterns, filePath);

        if (newSource !== source) {
          path.node.source.value = newSource;
          modified = true;
        }
      }
    },

    ExportAllDeclaration(path) {
      const source = path.node.source.value;
      const newSource = applyRewriteRules(source, patterns, filePath);

      if (newSource !== source) {
        path.node.source.value = newSource;
        modified = true;
      }
    },

    // Handle: import("...")
    CallExpression(path) {
      // Dynamic import
      if (path.node.callee.type === 'Import') {
        const arg = path.node.arguments[0];
        if (arg && arg.type === 'StringLiteral') {
          const newSource = applyRewriteRules(arg.value, patterns, filePath);
          if (newSource !== arg.value) {
            arg.value = newSource;
            modified = true;
          }
        }
      }

      // require("...")
      if (
        path.node.callee.type === 'Identifier' &&
        path.node.callee.name === 'require'
      ) {
        const arg = path.node.arguments[0];
        if (arg && arg.type === 'StringLiteral') {
          const newSource = applyRewriteRules(arg.value, patterns, filePath);
          if (newSource !== arg.value) {
            arg.value = newSource;
            modified = true;
          }
        }
      }
    }
  });

  // If modified, generate new code and write back
  if (modified) {
    const output = generate.default(ast, {
      retainLines: true,
      retainFunctionParens: true,
      compact: false
    }, code);

    fs.writeFileSync(filePath, output.code, 'utf-8');
    return true;
  }

  return false;
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node rewrite-imports.mjs <file-path> <rewrite-map-json>');
    console.error('');
    console.error('Example:');
    console.error('  node rewrite-imports.mjs src/walrus/client/WalrusBlobClient.js scripts/refactor/import-rewrite-map.json');
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);
  const rewriteMapPath = path.resolve(args[1]);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  // Load rewrite map
  let rewriteMap;
  try {
    const rewriteMapContent = fs.readFileSync(rewriteMapPath, 'utf-8');
    rewriteMap = JSON.parse(rewriteMapContent);
  } catch (error) {
    console.error(`Error loading rewrite map: ${error.message}`);
    process.exit(1);
  }

  // Rewrite imports
  try {
    const wasModified = rewriteImports(filePath, rewriteMap);

    if (wasModified) {
      console.log(`✓ Rewrote imports: ${filePath}`);
      process.exit(0);
    } else {
      // Not an error, just no changes needed
      console.log(`- No changes: ${filePath}`);
      process.exit(0);
    }
  } catch (error) {
    console.error(`Error rewriting ${filePath}:`);
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { rewriteImports, applyRewriteRules };
