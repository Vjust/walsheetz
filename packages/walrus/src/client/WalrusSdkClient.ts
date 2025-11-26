import { WalrusClient } from '@mysten/walrus';
import { SuiClient } from '@mysten/sui/client';
import { getCurrentConfig } from "../config/BlockchainConfig.js";

interface WalrusSdkClientOptions {
  suiClient?: SuiClient;
  suiClientUrl?: string;
  network?: string;
}

export class WalrusSdkClient {
  suiClient: SuiClient;
  client: WalrusClient;
  config: ReturnType<typeof getCurrentConfig>;

  constructor({ suiClient, suiClientUrl, network }: WalrusSdkClientOptions = {}) {
    const cfg = getCurrentConfig();

    // Use provided suiClient, or create one with proxy-aware URL from loader
    // suiClientUrl is passed by WalrusSdkClientLoader and uses config.getServiceUrl()
    // which ensures dev uses /sui-rpc and prod uses /api/sui-rpc-proxy
    this.suiClient = suiClient || new SuiClient({ url: suiClientUrl || cfg.sui.rpcUrl });

    // Determine network from config if not provided
    const sdkNetwork = network || cfg.walrus.features.sdkNetwork || (cfg.environment === 'mainnet' ? 'mainnet' : 'testnet');

    this.client = new WalrusClient({
      network: sdkNetwork as 'mainnet' | 'testnet',
      suiClient: this.suiClient as any
    });

    this.config = cfg;
  }

  /**
   * Write JSON blob using Walrus SDK with encode → register → upload → certify flow
   * @param {Object} options - Options for blob writing
   * @param {Object} options.json - JSON data to store
   * @param {string} options.identifier - Blob identifier (default: walsheetz-v1.json)
   * @param {Object} options.tags - Additional tags for the blob
   * @param {number} options.epochs - Number of epochs to store (default from config)
   * @returns {Promise<{encodedBlob, registerTx}>} - Returns encoded blob and register transaction
   */
  async writeJsonBlob({ json, identifier = 'walsheetz-v1.json', tags = {}, epochs }: { json: unknown; identifier?: string; tags?: Record<string, string>; epochs?: number }): Promise<{ encodedBlob: unknown; registerTx: unknown }> {
    try {
      // Encode JSON data to Uint8Array
      const contents = new TextEncoder().encode(JSON.stringify(json));

      // Encode blob for Walrus
      const encodedBlob = await this.client.encodeBlob(contents);

      // Get default epochs from config
      const defaultEpochs = this.config.walrus.features.epochsDefault || 50;
      const storageEpochs = epochs || defaultEpochs;

      // Create register transaction
      const registerTx = await (this.client as any).registerBlobTransaction({
        blob: encodedBlob,
        epochs: storageEpochs,
        deletable: true
      });

      return { encodedBlob, registerTx };
    } catch (error) {
      console.error('Error creating Walrus SDK blob write:', error);
      throw new Error(`Failed to create Walrus blob write: ${(error as Error).message}`);
    }
  }

  /**
   * Complete the upload and certification process after register transaction is signed
   * @param {Object} encodedBlob - The encoded blob from writeJsonBlob
   * @param {Function} signAndExecute - Function to sign and execute transactions
   * @returns {Promise<{blobId, certifyResult}>} - Results from upload and certification
   */
  async completeUploadAndCertify(encodedBlob, signAndExecute) {
    try {
      // Upload the blob to Walrus
      const writeResult = await this.client.writeBlob(encodedBlob);

      if (!writeResult) {
        throw new Error('Upload failed: no result returned');
      }

      // Extract blobId from result (may be string or object with blobId property)
      const blobId = typeof writeResult === 'string' ? writeResult : (writeResult as any).blobId || writeResult;

      // Create and execute certification transaction
      const certifyTx = await (this.client as any).certifyBlobTransaction({ blobId: String(blobId) });
      const certifyResult = await signAndExecute({ transactionBlock: certifyTx });

      return {
        blobId: String(blobId),
        certifyResult
      };
    } catch (error) {
      console.error('Error completing Walrus upload and certification:', error);
      throw new Error(`Failed to complete upload and certification: ${(error as Error).message}`);
    }
  }

  /**
   * Get the Sui client instance
   * @returns {SuiClient} - The Sui client
   */
  getSuiClient() {
    return this.suiClient;
  }

  /**
   * Get the Walrus client instance
   * @returns {WalrusClient} - The Walrus client
   */
  getWalrusClient() {
    return this.client;
  }
}