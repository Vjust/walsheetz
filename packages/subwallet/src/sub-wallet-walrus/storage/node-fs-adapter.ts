/**
 * Node.js filesystem storage adapter
 * Reads/writes wallet YAML files like the original shell scripts
 */

import type { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import type { StorageAdapter, WalletMetadata } from '../../types.js';

/**
 * Node.js filesystem adapter - only works in Node environment
 * To use in browser, use MemoryStorageAdapter or implement browser storage
 */
export class NodeFsStorageAdapter implements StorageAdapter {
  private walletsDir: string;
  private fs: typeof import('fs/promises') | null = null;
  private yaml: typeof import('yaml') | null = null;
  private path: typeof import('path') | null = null;

  constructor(walletsDir: string) {
    this.walletsDir = walletsDir;
  }

  /**
   * Lazy-load Node modules to avoid breaking in browser
   */
  private async ensureModules() {
    if (!this.fs) {
      try {
        this.fs = await import('fs/promises');
        this.yaml = await import('yaml');
        this.path = await import('path');
      } catch (err) {
        throw new Error(
          'NodeFsStorageAdapter requires Node.js environment. Use MemoryStorageAdapter for browser.'
        );
      }
    }
  }

  async loadWallets(): Promise<WalletMetadata[]> {
    await this.ensureModules();
    const fs = this.fs!;
    const yaml = this.yaml!;
    const path = this.path!;

    const wallets: WalletMetadata[] = [];

    try {
      const files = await fs.readdir(this.walletsDir);
      const yamlFiles = files.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

      for (const file of yamlFiles) {
        const filePath = path.join(this.walletsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const doc = yaml.parse(content) as {
          active_address?: string;
          activeAddress?: string;
        };

        const address =
          doc.active_address?.replace(/"/g, '') || doc.activeAddress?.replace(/"/g, '');
        if (address) {
          // Extract ID from filename (e.g., sui_client_0.yaml -> "0")
          const match = file.match(/sui_client_(\d+)\.ya?ml/);
          const id = match ? match[1] : file.replace(/\.ya?ml$/, '');

          wallets.push({
            id,
            address,
            filePath,
          });
        }
      }
    } catch (err) {
      // Directory doesn't exist or not readable
      console.warn(`Failed to load wallets from ${this.walletsDir}:`, err);
    }

    return wallets;
  }

  async saveWallets(wallets: WalletMetadata[]): Promise<void> {
    await this.ensureModules();
    const fs = this.fs!;
    const yaml = this.yaml!;
    const path = this.path!;

    // Ensure directory exists
    await fs.mkdir(this.walletsDir, { recursive: true });

    // Write each wallet as a YAML file
    for (const wallet of wallets) {
      const filename = wallet.filePath
        ? path.basename(wallet.filePath)
        : `sui_client_${wallet.id}.yaml`;
      const filePath = path.join(this.walletsDir, filename);

      const doc = {
        active_address: wallet.address,
        // Preserve other metadata if needed
        ...(wallet.metadata || {}),
      };

      await fs.writeFile(filePath, yaml.stringify(doc), 'utf-8');
    }
  }

  async loadKeypair(walletId: string): Promise<Ed25519Keypair | null> {
    await this.ensureModules();
    const fs = this.fs!;
    const yaml = this.yaml!;
    const path = this.path!;

    // Look for keypair in wallet YAML (custom field: quickwalrus_secret_b64)
    const yamlPath = path.join(this.walletsDir, `sui_client_${walletId}.yaml`);

    try {
      const content = await fs.readFile(yamlPath, 'utf-8');
      const doc = yaml.parse(content) as {
        quickwalrus_secret_b64?: string;
      };

      if (doc.quickwalrus_secret_b64) {
        // Decode base64 and create keypair
        const { Ed25519Keypair } = await import('@mysten/sui.js/keypairs/ed25519');
        const decoded = Buffer.from(doc.quickwalrus_secret_b64, 'base64');
        // Sui keystore stores 32-byte secret key at end of 64-byte buffer
        const secretKey = decoded.slice(-32);
        return Ed25519Keypair.fromSecretKey(secretKey);
      }
    } catch (err) {
      // File doesn't exist or no keypair field
    }

    return null;
  }

  async saveKeypair(walletId: string, keypair: Ed25519Keypair): Promise<void> {
    await this.ensureModules();
    const fs = this.fs!;
    const yaml = this.yaml!;
    const path = this.path!;

    const yamlPath = path.join(this.walletsDir, `sui_client_${walletId}.yaml`);

    // Ensure the directory exists before writing
    await fs.mkdir(this.walletsDir, { recursive: true });

    // Read existing YAML
    let doc: Record<string, unknown> = {};
    try {
      const content = await fs.readFile(yamlPath, 'utf-8');
      doc = yaml.parse(content) as Record<string, unknown>;
    } catch (err) {
      // File doesn't exist yet
    }

    // Export keypair and encode as base64
    const exported = keypair.export();
    // exported.privateKey is base64-encoded string, decode it first
    const secretKey = new Uint8Array(Buffer.from(exported.privateKey, 'base64'));
    // Recreate 64-byte format (32 bytes secret + 32 bytes public)
    const publicKey = keypair.getPublicKey().toRawBytes();
    const combined = new Uint8Array(64);
    combined.set(secretKey, 0);
    combined.set(publicKey, 32);
    const b64 = Buffer.from(Array.from(combined)).toString('base64');

    doc.quickwalrus_secret_b64 = b64;

    await fs.writeFile(yamlPath, yaml.stringify(doc), 'utf-8');
  }
}

