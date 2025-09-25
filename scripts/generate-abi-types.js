#!/usr/bin/env node

/**
 * ABI Types Generator
 *
 * Generates build-time type definitions from Sui Move packages.
 * This script snapshots the ABI at build time and creates:
 * 1. frontend/types/abi.json - Raw ABI data
 * 2. frontend/types/abi.d.ts - TypeScript definitions
 * 3. JSDoc comments for JavaScript usage
 *
 * Run with: node scripts/generate-abi-types.js
 * Add to package.json predev script for automatic generation
 */

import { promises as fs } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = resolve(__dirname, '..');
const CONFIG_PATH = resolve(PROJECT_ROOT, 'app-config.json');
const TYPES_DIR = resolve(PROJECT_ROOT, 'frontend/types');
const ABI_JSON_PATH = resolve(TYPES_DIR, 'abi.json');
const ABI_DTS_PATH = resolve(TYPES_DIR, 'abi.d.ts');

/**
 * SuiClient for ABI fetching
 */
class SimpleRpcClient {
  constructor(rpcUrl) {
    this.rpcUrl = rpcUrl;
  }

  async call(method, params) {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      })
    });

    if (!response.ok) {
      throw new Error(`RPC call failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    if (result.error) {
      throw new Error(`RPC error: ${result.error.message}`);
    }

    return result.result;
  }

  async getNormalizedMoveModulesByPackage(packageId) {
    return this.call('sui_getNormalizedMoveModulesByPackage', [packageId]);
  }
}

/**
 * Load application configuration
 */
async function loadConfig() {
  try {
    const configContent = await fs.readFile(CONFIG_PATH, 'utf8');
    const config = JSON.parse(configContent);
    console.log(`✅ Loaded config version ${config.version}`);
    return config;
  } catch (error) {
    console.error('❌ Failed to load app-config.json:', error.message);
    process.exit(1);
  }
}

/**
 * Create types directory if it doesn't exist
 */
async function ensureTypesDirectory() {
  try {
    await fs.mkdir(TYPES_DIR, { recursive: true });
    console.log(`✅ Types directory ready: ${TYPES_DIR}`);
  } catch (error) {
    console.error('❌ Failed to create types directory:', error.message);
    process.exit(1);
  }
}

/**
 * Fetch ABI from Sui network
 */
async function fetchABI(network) {
  const { rpcUrl, packageId } = network;

  if (!packageId) {
    throw new Error('Package ID not configured for this network');
  }

  console.log(`🔍 Fetching ABI from ${rpcUrl} for package ${packageId}`);

  const client = new SimpleRpcClient(rpcUrl);
  const modules = await client.getNormalizedMoveModulesByPackage(packageId);

  console.log(`✅ Fetched ABI for ${Object.keys(modules).length} modules`);
  return modules;
}

/**
 * Extract function signatures with parameter analysis
 */
function extractFunctionSignatures(modules) {
  const signatures = {};

  Object.entries(modules).forEach(([moduleName, moduleData]) => {
    if (!moduleData.exposedFunctions) return;

    Object.entries(moduleData.exposedFunctions).forEach(([functionName, funcData]) => {
      const fullName = `${moduleName}::${functionName}`;

      const parameters = funcData.parameters || [];
      const returnTypes = funcData.return_ || [];

      // Analyze parameters for type detection
      const paramAnalysis = analyzeParameters(parameters);

      signatures[fullName] = {
        name: functionName,
        module: moduleName,
        fullName,
        parameters,
        parameterCount: parameters.length,
        returnTypes,
        visibility: funcData.visibility,
        typeParameters: funcData.typeParameters || [],
        analysis: paramAnalysis,
        // Helper flags for common patterns
        isMutable: funcData.visibility === 'Public' && parameters.some(p =>
          typeof p === 'object' && p.MutableReference
        ),
        hasContext: parameters.some(p =>
          typeof p === 'string' && p.includes('TxContext')
        ),
        hasClock: parameters.some(p =>
          typeof p === 'string' && p.includes('Clock')
        )
      };
    });
  });

  return signatures;
}

/**
 * Analyze function parameters for type patterns
 */
function analyzeParameters(parameters) {
  const analysis = {
    stringCount: 0,
    u64Count: 0,
    objectCount: 0,
    referenceCount: 0,
    mutableReferenceCount: 0,
    clockPosition: -1,
    contextPosition: -1,
    stringPositions: [],
    u64Positions: []
  };

  parameters.forEach((param, index) => {
    if (typeof param === 'string') {
      // String parameter types
      if (param.includes('String') || param.includes('string::')) {
        analysis.stringCount++;
        analysis.stringPositions.push(index);
      }

      // U64 parameter types
      if (param.includes('u64')) {
        analysis.u64Count++;
        analysis.u64Positions.push(index);
      }

      // Clock parameter
      if (param.includes('Clock')) {
        analysis.clockPosition = index;
      }

      // TxContext parameter
      if (param.includes('TxContext')) {
        analysis.contextPosition = index;
      }
    } else if (typeof param === 'object') {
      // Object references
      if (param.Reference) {
        analysis.referenceCount++;
        analysis.objectCount++;
      } else if (param.MutableReference) {
        analysis.mutableReferenceCount++;
        analysis.objectCount++;
      }
    }
  });

  return analysis;
}

/**
 * Generate TypeScript definitions
 */
function generateTypeScriptDefinitions(signatures, metadata) {
  const content = `/**
 * Generated ABI Type Definitions for WalSheetz
 *
 * Generated on: ${new Date().toISOString()}
 * Package ID: ${metadata.packageId}
 * Network: ${metadata.network}
 *
 * @fileoverview Type definitions for Sui Move contract functions
 */

declare module '@/types/abi' {
  /**
   * Parameter types for Move functions
   */
  export interface MoveParameter {
    type: string;
    isReference?: boolean;
    isMutable?: boolean;
  }

  /**
   * Function signature metadata
   */
  export interface FunctionSignature {
    name: string;
    module: string;
    fullName: string;
    parameters: (string | object)[];
    parameterCount: number;
    returnTypes: (string | object)[];
    visibility: string;
    typeParameters: string[];
    analysis: {
      stringCount: number;
      u64Count: number;
      objectCount: number;
      referenceCount: number;
      mutableReferenceCount: number;
      clockPosition: number;
      contextPosition: number;
      stringPositions: number[];
      u64Positions: number[];
    };
    isMutable: boolean;
    hasContext: boolean;
    hasClock: boolean;
  }

  /**
   * Complete ABI data structure
   */
  export interface ABI {
    metadata: {
      packageId: string;
      network: string;
      generatedAt: string;
      moduleCount: number;
      functionCount: number;
    };
    signatures: Record<string, FunctionSignature>;
    modules: Record<string, any>;
  }

  // Specific function signatures for WalSheetz
${generateFunctionTypeDefinitions(signatures)}

  /**
   * Main ABI export
   */
  export const abi: ABI;
  export const signatures: Record<string, FunctionSignature>;
}

/**
 * Utility types for function argument construction
 */
export type SpreadsheetFunctionArgs = {
${generateArgTypeDefinitions(signatures)}
};

/**
 * Type guards for function signature validation
 */
export interface FunctionTypeGuards {
  isSpreadsheetFunction(fullName: string): boolean;
  requiresContentHash(fullName: string): boolean;
  getExpectedArgCount(fullName: string): number;
  validateArguments(fullName: string, args: any[]): boolean;
}
`;

  return content;
}

/**
 * Generate specific function type definitions
 */
function generateFunctionTypeDefinitions(signatures) {
  const spreadsheetFunctions = Object.values(signatures)
    .filter(sig => sig.module.includes('spreadsheet'))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (spreadsheetFunctions.length === 0) {
    return '  // No spreadsheet functions found';
  }

  return spreadsheetFunctions.map(sig => {
    const paramTypes = sig.parameters.map((param, index) => {
      if (typeof param === 'string') {
        if (param.includes('String')) return 'string';
        if (param.includes('u64')) return 'number';
        if (param.includes('Clock')) return 'object';
        if (param.includes('TxContext')) return 'object';
        return 'any';
      }
      return 'object';
    });

    return `  /**
   * ${sig.fullName}
   * Parameters: ${sig.parameterCount}
   * ${sig.analysis.stringCount > 0 ? `Strings: ${sig.analysis.stringCount}` : ''}
   * ${sig.analysis.u64Count > 0 ? `Numbers: ${sig.analysis.u64Count}` : ''}
   */
  export interface ${sig.name}Args {
    ${paramTypes.map((type, index) => `    arg${index}: ${type};`).join('\n')}
  }`;
  }).join('\n\n');
}

/**
 * Generate argument type definitions
 */
function generateArgTypeDefinitions(signatures) {
  const spreadsheetFunctions = Object.values(signatures)
    .filter(sig => sig.module.includes('spreadsheet'));

  return spreadsheetFunctions.map(sig =>
    `  '${sig.fullName}': ${sig.name}Args;`
  ).join('\n');
}

/**
 * Generate JSDoc comments for JavaScript usage
 */
function generateJSDocComments(signatures) {
  const spreadsheetFunctions = Object.values(signatures)
    .filter(sig => sig.module.includes('spreadsheet'));

  const jsdocContent = `/**
 * JSDoc Type Definitions for WalSheetz ABI
 *
 * Use these JSDoc comments in JavaScript files for better IDE support.
 */

${spreadsheetFunctions.map(sig => `
/**
 * ${sig.fullName}
 * @typedef {Object} ${sig.name}Args
${sig.parameters.map((param, index) => {
  const type = typeof param === 'string' && param.includes('String') ? 'string' :
               typeof param === 'string' && param.includes('u64') ? 'number' : 'any';
  return ` * @property {${type}} arg${index} - Parameter ${index}`;
}).join('\n')}
 */`).join('\n')}
`;

  return jsdocContent;
}

/**
 * Detect critical function signatures (like save_version)
 */
function detectCriticalSignatures(signatures) {
  const critical = {};

  // Look for save_version function specifically
  const saveVersionKey = Object.keys(signatures).find(key =>
    key.includes('save_version')
  );

  if (saveVersionKey) {
    const sig = signatures[saveVersionKey];
    critical.save_version = {
      ...sig,
      expectsContentHash: sig.analysis.stringCount >= 2,
      expectedArgCount: sig.parameterCount,
      stringPositions: sig.analysis.stringPositions,
      firstU64Position: sig.analysis.u64Positions[0] || -1
    };
  }

  return critical;
}

/**
 * Write ABI JSON file
 */
async function writeABIJson(abi) {
  const content = JSON.stringify(abi, null, 2);
  await fs.writeFile(ABI_JSON_PATH, content, 'utf8');
  console.log(`✅ Generated ${ABI_JSON_PATH}`);
}

/**
 * Write TypeScript definitions
 */
async function writeTypeDefinitions(content) {
  await fs.writeFile(ABI_DTS_PATH, content, 'utf8');
  console.log(`✅ Generated ${ABI_DTS_PATH}`);
}

/**
 * Write JSDoc file for JavaScript support
 */
async function writeJSDocFile(content) {
  const jsdocPath = resolve(TYPES_DIR, 'abi.jsdoc.js');
  await fs.writeFile(jsdocPath, content, 'utf8');
  console.log(`✅ Generated ${jsdocPath}`);
}

/**
 * Main execution function
 */
async function main() {
  console.log('🚀 Starting ABI types generation...');

  try {
    // Load configuration
    const config = await loadConfig();

    // Determine target network (default to testnet)
    const networkName = process.env.NODE_ENV === 'production' ? 'mainnet' : 'testnet';
    const network = config.networks[networkName];

    if (!network || !network.packageId) {
      console.warn(`⚠️  Package ID not configured for ${networkName}, skipping ABI generation`);
      return;
    }

    console.log(`🎯 Target network: ${networkName}`);

    // Ensure output directory exists
    await ensureTypesDirectory();

    // Fetch ABI from network
    const modules = await fetchABI(network);

    // Extract function signatures
    const signatures = extractFunctionSignatures(modules);
    const functionCount = Object.keys(signatures).length;
    console.log(`📋 Extracted ${functionCount} function signatures`);

    // Detect critical signatures
    const critical = detectCriticalSignatures(signatures);
    console.log(`🔍 Detected ${Object.keys(critical).length} critical function signatures`);

    // Create ABI data structure
    const metadata = {
      packageId: network.packageId,
      network: networkName,
      generatedAt: new Date().toISOString(),
      moduleCount: Object.keys(modules).length,
      functionCount,
      critical
    };

    const abi = {
      metadata,
      signatures,
      modules,
      critical
    };

    // Generate outputs
    await writeABIJson(abi);

    const tsContent = generateTypeScriptDefinitions(signatures, metadata);
    await writeTypeDefinitions(tsContent);

    const jsdocContent = generateJSDocComments(signatures);
    await writeJSDocFile(jsdocContent);

    // Log summary
    console.log('\\n🎉 ABI types generation completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   • Network: ${networkName}`);
    console.log(`   • Package: ${network.packageId}`);
    console.log(`   • Modules: ${Object.keys(modules).length}`);
    console.log(`   • Functions: ${functionCount}`);
    console.log(`   • Critical: ${Object.keys(critical).length}`);

    if (critical.save_version) {
      console.log(`\\n🔧 save_version signature:`);
      console.log(`   • Expects content hash: ${critical.save_version.expectsContentHash}`);
      console.log(`   • Expected args: ${critical.save_version.expectedArgCount}`);
      console.log(`   • String count: ${critical.save_version.analysis.stringCount}`);
    }

  } catch (error) {
    console.error('❌ ABI types generation failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Execute if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}