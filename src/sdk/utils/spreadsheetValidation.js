/**
 * Validation utilities for spreadsheet creation
 * Provides comprehensive validation for user input and creation requests
 */

export class SpreadsheetValidation {
  static MIN_TITLE_LENGTH = 1;
  static MAX_TITLE_LENGTH = 100;
  static FORBIDDEN_CHARACTERS = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
  static RESERVED_NAMES = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];

  /**
   * Validates a spreadsheet title
   * @param {string} title - The title to validate
   * @returns {Object} Validation result with isValid and errors array
   */
  static validateTitle(title) {
    const errors = [];

    // Check if title exists
    if (!title || typeof title !== 'string') {
      errors.push('Title is required');
      return { isValid: false, errors };
    }

    const trimmedTitle = title.trim();

    // Check length
    if (trimmedTitle.length < this.MIN_TITLE_LENGTH) {
      errors.push('Title cannot be empty');
    }

    if (trimmedTitle.length > this.MAX_TITLE_LENGTH) {
      errors.push(`Title cannot exceed ${this.MAX_TITLE_LENGTH} characters`);
    }

    // Check for forbidden characters
    const foundForbidden = this.FORBIDDEN_CHARACTERS.filter(char => trimmedTitle.includes(char));
    if (foundForbidden.length > 0) {
      errors.push(`Title contains forbidden characters: ${foundForbidden.join(', ')}`);
    }

    // Check for reserved names (case insensitive)
    if (this.RESERVED_NAMES.includes(trimmedTitle.toUpperCase())) {
      errors.push('Title cannot be a reserved system name');
    }

    // Check for leading/trailing dots or spaces (after trim, check original)
    if (title.startsWith('.') || title.endsWith('.')) {
      errors.push('Title cannot start or end with a period');
    }

    // Check for only whitespace
    if (trimmedTitle.length === 0 && title.length > 0) {
      errors.push('Title cannot contain only whitespace');
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedTitle: trimmedTitle
    };
  }

  /**
   * Validates a template selection
   * @param {string} templateId - The template ID to validate
   * @param {Array} availableTemplates - Array of available template objects
   * @returns {Object} Validation result
   */
  static validateTemplate(templateId, availableTemplates = []) {
    const errors = [];

    if (!templateId || typeof templateId !== 'string') {
      errors.push('Template selection is required');
      return { isValid: false, errors };
    }

    // Check if template exists in available templates
    const template = availableTemplates.find(t => t.id === templateId);
    if (!template) {
      errors.push('Selected template is not available');
    }

    return {
      isValid: errors.length === 0,
      errors,
      template
    };
  }

  /**
   * Validates wallet connection for blockchain operations
   * @param {string} walletAddress - The wallet address to validate
   * @returns {Object} Validation result
   */
  static validateWallet(walletAddress) {
    const errors = [];

    if (!walletAddress) {
      errors.push('Wallet connection is required for spreadsheet creation');
      return { isValid: false, errors };
    }

    // Basic Sui address format validation (starts with 0x and is 66 characters long)
    if (typeof walletAddress !== 'string') {
      errors.push('Invalid wallet address format');
    } else if (!walletAddress.startsWith('0x')) {
      errors.push('Wallet address must start with 0x');
    } else if (walletAddress.length !== 66) {
      errors.push('Wallet address must be 66 characters long');
    } else if (!/^0x[a-fA-F0-9]{64}$/.test(walletAddress)) {
      errors.push('Wallet address contains invalid characters');
    }

    return {
      isValid: errors.length === 0,
      errors,
      walletAddress: walletAddress.toLowerCase()
    };
  }

  /**
   * Validates the complete creation request
   * @param {Object} request - The creation request object
   * @param {Array} availableTemplates - Available templates
   * @returns {Object} Complete validation result
   */
  static validateCreationRequest(request, availableTemplates = []) {
    const errors = [];
    const validationResults = {};

    // Validate title
    const titleValidation = this.validateTitle(request.title);
    validationResults.title = titleValidation;
    if (!titleValidation.isValid) {
      errors.push(...titleValidation.errors);
    }

    // Validate template
    const templateValidation = this.validateTemplate(request.template, availableTemplates);
    validationResults.template = templateValidation;
    if (!templateValidation.isValid) {
      errors.push(...templateValidation.errors);
    }

    // Validate wallet (optional for some operations)
    if (request.walletAddress) {
      const walletValidation = this.validateWallet(request.walletAddress);
      validationResults.wallet = walletValidation;
      if (!walletValidation.isValid) {
        errors.push(...walletValidation.errors);
      }
    }

    // Additional business logic validations
    if (request.timestamp && typeof request.timestamp !== 'number') {
      errors.push('Invalid timestamp format');
    }

    return {
      isValid: errors.length === 0,
      errors,
      validationResults,
      sanitizedRequest: {
        title: titleValidation.sanitizedTitle,
        template: templateValidation.template?.id || request.template,
        walletAddress: validationResults.wallet?.walletAddress || request.walletAddress,
        timestamp: request.timestamp || Date.now()
      }
    };
  }

  /**
   * Validates file size and format for uploads
   * @param {File|Blob} file - File to validate
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  static validateFile(file, options = {}) {
    const {
      maxSize = 10 * 1024 * 1024, // 10MB default
      allowedTypes = ['application/json', 'text/plain'],
      maxFilenameLength = 255
    } = options;

    const errors = [];

    if (!file) {
      errors.push('File is required');
      return { isValid: false, errors };
    }

    // Check file size
    if (file.size > maxSize) {
      errors.push(`File size cannot exceed ${Math.round(maxSize / 1024 / 1024)}MB`);
    }

    // Check file type
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
      errors.push(`File type not allowed. Accepted types: ${allowedTypes.join(', ')}`);
    }

    // Check filename length
    if (file.name && file.name.length > maxFilenameLength) {
      errors.push(`Filename cannot exceed ${maxFilenameLength} characters`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      fileInfo: {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
      }
    };
  }

  /**
   * Validates network connectivity and service availability
   * @returns {Promise<Object>} Async validation result
   */
  static async validateConnectivity() {
    const errors = [];
    const checks = {};

    try {
      // Check if we're online
      if (!navigator.onLine) {
        errors.push('No internet connection detected');
        checks.online = false;
      } else {
        checks.online = true;
      }

      // Check Sui RPC availability (basic ping)
      try {
        const suiResponse = await fetch('/sui-rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'sui_getLatestSuiSystemState',
            params: [],
            id: 1
          })
        });
        checks.suiRpc = suiResponse.ok;
        if (!suiResponse.ok) {
          errors.push('Sui blockchain service is unavailable');
        }
      } catch (error) {
        checks.suiRpc = false;
        errors.push('Cannot connect to Sui blockchain service');
      }

      // Check Walrus availability
      try {
        const walrusResponse = await fetch('/walrus-publisher', {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        checks.walrus = walrusResponse.ok;
        if (!walrusResponse.ok) {
          errors.push('Walrus storage service is unavailable');
        }
      } catch (error) {
        checks.walrus = false;
        errors.push('Cannot connect to Walrus storage service');
      }

    } catch (error) {
      errors.push('Network connectivity check failed');
    }

    return {
      isValid: errors.length === 0,
      errors,
      checks
    };
  }

  /**
   * Sanitizes user input to prevent XSS and other attacks
   * @param {string} input - Input to sanitize
   * @returns {string} Sanitized input
   */
  static sanitizeInput(input) {
    if (typeof input !== 'string') return input;

    return input
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocols
      .replace(/on\w+=/gi, '') // Remove event handlers
      .slice(0, 1000); // Limit length
  }

  /**
   * Validates and sanitizes a complete form submission
   * @param {Object} formData - Raw form data
   * @param {Array} availableTemplates - Available templates
   * @returns {Object} Validation and sanitization result
   */
  static validateAndSanitizeForm(formData, availableTemplates = []) {
    // Sanitize inputs first
    const sanitizedData = {
      title: this.sanitizeInput(formData.title),
      template: this.sanitizeInput(formData.template),
      walletAddress: formData.walletAddress, // Don't sanitize wallet address
      timestamp: formData.timestamp
    };

    // Then validate
    return this.validateCreationRequest(sanitizedData, availableTemplates);
  }
}

export default SpreadsheetValidation;