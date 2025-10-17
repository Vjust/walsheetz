import { logger, LogComponent } from '../utils/Logger.js';

/**
 * Service for integrating with cloud storage providers (Google Drive, OneDrive)
 * Provides authentication, file browsing, and direct import/export capabilities
 */
export class CloudStorageService {
  constructor(options = {}) {
    this.googleDriveConfig = options.googleDrive || {
      clientId: process.env.REACT_APP_GOOGLE_DRIVE_CLIENT_ID,
      apiKey: process.env.REACT_APP_GOOGLE_DRIVE_API_KEY,
      scope: 'https://www.googleapis.com/auth/drive.file',
      redirectUri: options.googleDriveRedirectUri || `${window.location.origin}/auth/google-callback`
    };

    this.oneDriveConfig = options.oneDrive || {
      clientId: process.env.REACT_APP_ONEDRIVE_CLIENT_ID,
      redirectUri: options.oneDriveRedirectUri || `${window.location.origin}/auth/onedrive-callback`
    };

    this.googleAuth = null;
    this.oneDriveAuth = null;
    this.googleDriveCache = new Map();
    this.oneDriveCache = new Map();
  }

  /**
   * Initialize Google Drive authentication
   * @returns {Promise<Boolean>} Whether authentication was successful
   */
  async initializeGoogleDrive() {
    try {
      // Check if Google API is already loaded
      if (!window.gapi) {
        logger.warn(LogComponent.UI_COMPONENT, 'google_api_not_loaded', 'Google API not loaded');
        return false;
      }

      await new Promise((resolve) => {
        window.gapi.load('client:auth2', resolve);
      });

      await window.gapi.client.init({
        clientId: this.googleDriveConfig.clientId,
        scope: this.googleDriveConfig.scope
      });

      this.googleAuth = window.gapi.auth2.getAuthInstance();

      logger.info(LogComponent.UI_COMPONENT, 'google_drive_initialized', 'Google Drive initialized');
      return true;
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'google_drive_init_error', 'Failed to initialize Google Drive', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Initialize OneDrive authentication
   * @returns {Promise<Boolean>} Whether authentication was successful
   */
  async initializeOneDrive() {
    try {
      // Check if Microsoft Graph is loaded
      if (!window.msal) {
        logger.warn(LogComponent.UI_COMPONENT, 'msal_not_loaded', 'MSAL library not loaded');
        return false;
      }

      // Initialize MSAL
      const msalConfig = {
        auth: {
          clientId: this.oneDriveConfig.clientId,
          redirectUri: this.oneDriveConfig.redirectUri,
          authority: 'https://login.microsoftonline.com/common'
        }
      };

      this.oneDriveAuth = new window.msal.PublicClientApplication(msalConfig);

      logger.info(LogComponent.UI_COMPONENT, 'onedrive_initialized', 'OneDrive initialized');
      return true;
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'onedrive_init_error', 'Failed to initialize OneDrive', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Authenticate with Google Drive
   * @returns {Promise<Boolean>} Whether authentication was successful
   */
  async authenticateGoogleDrive() {
    try {
      if (!this.googleAuth) {
        await this.initializeGoogleDrive();
      }

      const isSignedIn = this.googleAuth.isSignedIn.get();
      if (!isSignedIn) {
        await this.googleAuth.signIn();
      }

      logger.info(LogComponent.UI_COMPONENT, 'google_drive_authenticated', 'Google Drive authenticated');
      return true;
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'google_drive_auth_error', 'Failed to authenticate with Google Drive', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Authenticate with OneDrive
   * @returns {Promise<Boolean>} Whether authentication was successful
   */
  async authenticateOneDrive() {
    try {
      if (!this.oneDriveAuth) {
        await this.initializeOneDrive();
      }

      const accounts = this.oneDriveAuth.getAllAccounts();
      if (accounts.length === 0) {
        await this.oneDriveAuth.loginPopup({
          scopes: ['Files.ReadWrite']
        });
      }

      logger.info(LogComponent.UI_COMPONENT, 'onedrive_authenticated', 'OneDrive authenticated');
      return true;
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'onedrive_auth_error', 'Failed to authenticate with OneDrive', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * List files from Google Drive
   * @param {Object} options - Query options (folder, pageSize, etc.)
   * @returns {Promise<Array>} List of files
   */
  async listGoogleDriveFiles(options = {}) {
    try {
      const response = await window.gapi.client.drive.files.list({
        pageSize: options.pageSize || 20,
        spaces: 'drive',
        fields: 'files(id, name, mimeType, createdTime, modifiedTime, size)',
        q: options.query || 'mimeType contains "spreadsheet" or mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"',
        orderBy: 'modifiedTime desc'
      });

      const files = response.result.files || [];

      // Cache results
      this.googleDriveCache.set('lastQuery', { files, timestamp: Date.now() });

      logger.info(LogComponent.UI_COMPONENT, 'google_drive_files_listed', 'Google Drive files listed', {
        fileCount: files.length
      });

      return files;
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'google_drive_list_error', 'Failed to list Google Drive files', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * List files from OneDrive
   * @param {Object} options - Query options
   * @returns {Promise<Array>} List of files
   */
  async listOneDriveFiles(options = {}) {
    try {
      const accounts = this.oneDriveAuth.getAllAccounts();
      if (accounts.length === 0) {
        throw new Error('Not authenticated with OneDrive');
      }

      const account = accounts[0];
      const response = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children', {
        headers: {
          'Authorization': `Bearer ${account.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch files: ${response.statusText}`);
      }

      const data = await response.json();
      const files = data.value || [];

      // Filter for spreadsheet files
      const spreadsheetFiles = files.filter(file =>
        file.name.endsWith('.xlsx') ||
        file.name.endsWith('.xls') ||
        file.name.endsWith('.xlsm')
      );

      // Cache results
      this.oneDriveCache.set('lastQuery', { files: spreadsheetFiles, timestamp: Date.now() });

      logger.info(LogComponent.UI_COMPONENT, 'onedrive_files_listed', 'OneDrive files listed', {
        fileCount: spreadsheetFiles.length
      });

      return spreadsheetFiles;
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'onedrive_list_error', 'Failed to list OneDrive files', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Download file from Google Drive
   * @param {String} fileId - File ID
   * @returns {Promise<Blob>} File blob
   */
  async downloadFromGoogleDrive(fileId) {
    try {
      const response = await window.gapi.client.drive.files.get({
        fileId: fileId,
        alt: 'media'
      });

      logger.info(LogComponent.UI_COMPONENT, 'google_drive_file_downloaded', 'File downloaded from Google Drive', {
        fileId
      });

      return new Blob([response.body], { type: 'application/octet-stream' });
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'google_drive_download_error', 'Failed to download from Google Drive', {
        error: error.message,
        fileId
      });
      throw error;
    }
  }

  /**
   * Download file from OneDrive
   * @param {String} fileId - File ID
   * @returns {Promise<Blob>} File blob
   */
  async downloadFromOneDrive(fileId) {
    try {
      const accounts = this.oneDriveAuth.getAllAccounts();
      if (accounts.length === 0) {
        throw new Error('Not authenticated with OneDrive');
      }

      const account = accounts[0];
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`, {
        headers: {
          'Authorization': `Bearer ${account.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }

      const blob = await response.blob();

      logger.info(LogComponent.UI_COMPONENT, 'onedrive_file_downloaded', 'File downloaded from OneDrive', {
        fileId
      });

      return blob;
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'onedrive_download_error', 'Failed to download from OneDrive', {
        error: error.message,
        fileId
      });
      throw error;
    }
  }

  /**
   * Upload file to Google Drive
   * @param {File} file - File to upload
   * @param {Object} metadata - File metadata
   * @returns {Promise<Object>} Upload result
   */
  async uploadToGoogleDrive(file, metadata = {}) {
    try {
      const fileMetadata = {
        name: metadata.name || file.name,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };

      const response = await window.gapi.client.drive.files.create({
        resource: fileMetadata,
        media: {
          mimeType: file.type,
          body: file
        },
        fields: 'id, name, webViewLink'
      });

      logger.info(LogComponent.UI_COMPONENT, 'google_drive_file_uploaded', 'File uploaded to Google Drive', {
        fileId: response.result.id,
        fileName: response.result.name
      });

      return response.result;
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'google_drive_upload_error', 'Failed to upload to Google Drive', {
        error: error.message,
        fileName: file.name
      });
      throw error;
    }
  }

  /**
   * Upload file to OneDrive
   * @param {File} file - File to upload
   * @param {Object} metadata - File metadata
   * @returns {Promise<Object>} Upload result
   */
  async uploadToOneDrive(file, metadata = {}) {
    try {
      const accounts = this.oneDriveAuth.getAllAccounts();
      if (accounts.length === 0) {
        throw new Error('Not authenticated with OneDrive');
      }

      const account = accounts[0];
      const fileName = metadata.name || file.name;

      const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${fileName}:/content`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${account.accessToken}`,
          'Content-Type': file.type
        },
        body: file
      });

      if (!response.ok) {
        throw new Error(`Failed to upload file: ${response.statusText}`);
      }

      const result = await response.json();

      logger.info(LogComponent.UI_COMPONENT, 'onedrive_file_uploaded', 'File uploaded to OneDrive', {
        fileId: result.id,
        fileName: result.name
      });

      return result;
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'onedrive_upload_error', 'Failed to upload to OneDrive', {
        error: error.message,
        fileName: file.name
      });
      throw error;
    }
  }

  /**
   * Disconnect from Google Drive
   */
  disconnectGoogleDrive() {
    if (this.googleAuth) {
      this.googleAuth.signOut();
      logger.info(LogComponent.UI_COMPONENT, 'google_drive_disconnected', 'Disconnected from Google Drive');
    }
  }

  /**
   * Disconnect from OneDrive
   */
  disconnectOneDrive() {
    if (this.oneDriveAuth) {
      const accounts = this.oneDriveAuth.getAllAccounts();
      if (accounts.length > 0) {
        this.oneDriveAuth.logout();
        logger.info(LogComponent.UI_COMPONENT, 'onedrive_disconnected', 'Disconnected from OneDrive');
      }
    }
  }

  /**
   * Clear caches
   */
  clearCaches() {
    this.googleDriveCache.clear();
    this.oneDriveCache.clear();
  }

  /**
   * Get authentication status
   */
  getAuthenticationStatus() {
    return {
      googleDrive: this.googleAuth?.isSignedIn.get() || false,
      oneDrive: (this.oneDriveAuth?.getAllAccounts().length || 0) > 0
    };
  }
}

export default CloudStorageService;
