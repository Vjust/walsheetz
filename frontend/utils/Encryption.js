import { logger, LogComponent } from './Logger.js';

/**
 * Encryption utility for client-side data protection
 * Uses Web Crypto API for secure encryption/decryption
 */
export class EncryptionUtility {
  constructor(options = {}) {
    this.algorithm = 'AES-GCM';
    this.keyLength = 256; // 256-bit key
    this.saltLength = 16; // 128-bit salt
    this.ivLength = 12; // 96-bit IV for GCM mode
    this.encryptionKey = null;
    this.keyDerivationOptions = {
      name: 'PBKDF2',
      salt: null, // Will be set during initialization
      iterations: 100000,
      hash: 'SHA-256'
    };

    // Store the initialization promise for lazy loading
    this._initPromise = null;
    this._isReady = false;

    // Start initialization asynchronously but don't await in constructor
    this._initPromise = this.initializeEncryptionKey(options);
  }

  /**
   * Ensure encryption is ready before use
   */
  async ensureReady() {
    if (this._isReady) {
      return;
    }

    if (this._initPromise) {
      await this._initPromise;
    }

    if (!this.encryptionKey) {
      throw new Error('Encryption key failed to initialize');
    }
  }

  /**
   * Initialize encryption key from user's wallet address or session storage
   */
  async initializeEncryptionKey(options = {}) {
    try {
      let keyMaterial = options.keyMaterial;

      // If no key material provided, derive from wallet address
      if (!keyMaterial) {
        // Get wallet address from session or local storage
        const walletAddress = this.getWalletAddress();

        if (walletAddress) {
          // Use wallet address as base material for key derivation
          keyMaterial = walletAddress;
        } else {
          // Fallback to session-based key
          keyMaterial = this.generateSessionKey();
        }
      }

      // Generate or derive encryption key
      if (typeof keyMaterial === 'string') {
        // Derive key from string material
        this.encryptionKey = await this.deriveKeyFromString(keyMaterial);
      } else {
        // Use provided key material
        this.encryptionKey = await this.deriveKeyFromString(keyMaterial);
      }

      this._isReady = true;

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'encryption_init', 'Encryption utility initialized', {
        hasKey: !!this.encryptionKey,
        keyType: typeof keyMaterial
      });

    } catch (error) {
      this._isReady = false;
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'encryption_init_failed', 'Failed to initialize encryption key', {
        error: error.message
      });
      throw new Error('Encryption initialization failed');
    }
  }

  /**
   * Get wallet address from various sources (no browser storage)
   */
  getWalletAddress() {
    // Try to get from global wallet connection (RAM-based)
    if (typeof window !== 'undefined' && window.walletConnection?.address) {
      return window.walletConnection.address;
    }

    // RAM-only mode: sessionStorage disabled
    // Fallback to generating a session key
    return null;
  }

  /**
   * Generate a session-based key for fallback encryption (RAM-only)
   */
  generateSessionKey() {
    // Generate unique session ID in memory
    const sessionId = this._sessionId ||
                      `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this._sessionId = sessionId;
    return sessionId;
  }

  /**
   * Derive encryption key from string material
   */
  async deriveKeyFromString(keyMaterial) {
    try {
      // Convert string to Uint8Array
      const encoder = new TextEncoder();
      const keyData = encoder.encode(keyMaterial);

      // Generate salt in memory (no browser persistence)
      let salt = this._encryptionSalt;
      if (!salt) {
        salt = crypto.getRandomValues(new Uint8Array(this.saltLength));
        // Store in memory, not sessionStorage
        this._encryptionSalt = salt;
      }

      // Import key material
      const baseKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        'PBKDF2',
        false,
        ['deriveKey']
      );

      // Derive encryption key
      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: this.keyDerivationOptions.iterations,
          hash: this.keyDerivationOptions.hash
        },
        baseKey,
        { name: this.algorithm, length: this.keyLength },
        false,
        ['encrypt', 'decrypt']
      );

      return derivedKey;

    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'key_derivation_failed', 'Failed to derive encryption key', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Encrypt data before storing in Walrus
   */
  async encrypt(data) {
    try {
      // Ensure encryption is ready before proceeding
      await this.ensureReady();

      if (!this.encryptionKey) {
        throw new Error('Encryption key not initialized');
      }

      // Convert data to string if needed
      const dataString = typeof data === 'string' ? data : JSON.stringify(data);

      // Convert to Uint8Array
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(dataString);

      // Generate IV
      const iv = crypto.getRandomValues(new Uint8Array(this.ivLength));

      // Encrypt data
      const encryptedBuffer = await crypto.subtle.encrypt(
        {
          name: this.algorithm,
          iv: iv
        },
        this.encryptionKey,
        dataBuffer
      );

      // Convert to base64 for storage
      const encryptedArray = new Uint8Array(encryptedBuffer);
      const ivBase64 = this.arrayBufferToBase64(iv);
      const dataBase64 = this.arrayBufferToBase64(encryptedArray);

      const result = {
        encrypted: dataBase64,
        iv: ivBase64,
        algorithm: this.algorithm,
        timestamp: Date.now()
      };

      logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'data_encrypted', 'Data encrypted successfully', {
        originalSize: dataString.length,
        encryptedSize: dataBase64.length,
        compressionRatio: (dataBase64.length / dataString.length).toFixed(2)
      });

      return result;

    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'encryption_failed', 'Failed to encrypt data', {
        error: error.message
      });
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data retrieved from Walrus
   */
  async decrypt(encryptedData) {
    try {
      // Ensure encryption is ready before proceeding
      await this.ensureReady();

      if (!this.encryptionKey) {
        throw new Error('Encryption key not initialized');
      }

      // Validate encrypted data structure
      if (!encryptedData.encrypted || !encryptedData.iv) {
        throw new Error('Invalid encrypted data format');
      }

      // Convert from base64
      const iv = this.base64ToArrayBuffer(encryptedData.iv);
      const encryptedBuffer = this.base64ToArrayBuffer(encryptedData.encrypted);

      // Decrypt data
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: this.algorithm,
          iv: iv
        },
        this.encryptionKey,
        encryptedBuffer
      );

      // Convert back to string
      const decoder = new TextDecoder();
      const decryptedString = decoder.decode(decryptedBuffer);

      // Try to parse as JSON, fall back to string if not JSON
      try {
        const result = JSON.parse(decryptedString);
        return result;
      } catch {
        return decryptedString;
      }

    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'decryption_failed', 'Failed to decrypt data', {
        error: error.message
      });
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Helper: Convert ArrayBuffer to base64
   */
  arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  /**
   * Helper: Convert base64 to ArrayBuffer
   */
  base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Check if data is encrypted
   */
  isEncrypted(data) {
    return data &&
           typeof data === 'object' &&
           data.encrypted &&
           data.iv &&
           data.algorithm;
  }

  /**
   * Get encryption status
   */
  getEncryptionStatus() {
    return {
      initialized: this._isReady && !!this.encryptionKey,
      isReady: this._isReady,
      algorithm: this.algorithm,
      keyLength: this.keyLength,
      hasWalletAddress: !!this.getWalletAddress()
    };
  }

  /**
   * Reset encryption key (useful for testing or key rotation)
   */
  async resetEncryptionKey() {
    this.encryptionKey = null;
    this._encryptionSalt = null;
    this._sessionId = null;
    await this.initializeEncryptionKey();
  }
}

// Global encryption utility instance
export const encryptionUtility = new EncryptionUtility();
