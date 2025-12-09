/**
 * Validation utilities for spreadsheet creation
 */

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedTitle?: string;
  template?: Template;
  walletAddress?: string;
}

interface Template {
  id: string;
  name?: string;
  [key: string]: unknown;
}

interface CreationRequest {
  title?: string;
  template?: string;
  walletAddress?: string;
  timestamp?: number;
}

interface FileValidationOptions {
  maxSize?: number;
  allowedTypes?: string[];
  maxFilenameLength?: number;
}

interface FileInfo {
  name?: string;
  size: number;
  type: string;
  lastModified?: number;
}

interface ValidatableFile {
  name?: string;
  size: number;
  type: string;
  lastModified?: number;
}

interface ConnectivityChecks {
  online?: boolean;
  suiRpc?: boolean;
  walrus?: boolean;
}

interface FormData {
  title?: string;
  template?: string;
  walletAddress?: string;
  timestamp?: number;
}

export class SpreadsheetValidation {
  static MIN_TITLE_LENGTH = 1;
  static MAX_TITLE_LENGTH = 100;
  static FORBIDDEN_CHARACTERS = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
  static RESERVED_NAMES = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];

  static validateTitle(title: unknown): ValidationResult {
    const errors: string[] = [];

    if (!title || typeof title !== 'string') {
      errors.push('Title is required');
      return { isValid: false, errors };
    }

    const trimmedTitle = title.trim();

    if (trimmedTitle.length < this.MIN_TITLE_LENGTH) {
      errors.push('Title cannot be empty');
    }

    if (trimmedTitle.length > this.MAX_TITLE_LENGTH) {
      errors.push(`Title cannot exceed ${this.MAX_TITLE_LENGTH} characters`);
    }

    const foundForbidden = this.FORBIDDEN_CHARACTERS.filter(char => trimmedTitle.includes(char));
    if (foundForbidden.length > 0) {
      errors.push(`Title contains forbidden characters: ${foundForbidden.join(', ')}`);
    }

    if (this.RESERVED_NAMES.includes(trimmedTitle.toUpperCase())) {
      errors.push('Title cannot be a reserved system name');
    }

    if (title.startsWith('.') || title.endsWith('.')) {
      errors.push('Title cannot start or end with a period');
    }

    if (trimmedTitle.length === 0 && title.length > 0) {
      errors.push('Title cannot contain only whitespace');
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedTitle: trimmedTitle
    };
  }

  static validateTemplate(templateId: unknown, availableTemplates: Template[] = []): ValidationResult {
    const errors: string[] = [];

    if (!templateId || typeof templateId !== 'string') {
      errors.push('Template selection is required');
      return { isValid: false, errors };
    }

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

  static validateWallet(walletAddress: unknown): ValidationResult {
    const errors: string[] = [];

    if (!walletAddress) {
      errors.push('Wallet connection is required for spreadsheet creation');
      return { isValid: false, errors };
    }

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
      walletAddress: typeof walletAddress === 'string' ? walletAddress.toLowerCase() : undefined
    };
  }

  static validateCreationRequest(request: CreationRequest, availableTemplates: Template[] = []) {
    const errors: string[] = [];
    const validationResults: Record<string, ValidationResult> = {};

    const titleValidation = this.validateTitle(request.title);
    validationResults.title = titleValidation;
    if (!titleValidation.isValid) {
      errors.push(...titleValidation.errors);
    }

    const templateValidation = this.validateTemplate(request.template, availableTemplates);
    validationResults.template = templateValidation;
    if (!templateValidation.isValid) {
      errors.push(...templateValidation.errors);
    }

    if (request.walletAddress) {
      const walletValidation = this.validateWallet(request.walletAddress);
      validationResults.wallet = walletValidation;
      if (!walletValidation.isValid) {
        errors.push(...walletValidation.errors);
      }
    }

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

  static validateFile(file: ValidatableFile | null, options: FileValidationOptions = {}) {
    const {
      maxSize = 10 * 1024 * 1024,
      allowedTypes = ['application/json', 'text/plain'],
      maxFilenameLength = 255
    } = options;

    const errors: string[] = [];

    if (!file) {
      errors.push('File is required');
      return { isValid: false, errors };
    }

    if (file.size > maxSize) {
      errors.push(`File size cannot exceed ${Math.round(maxSize / 1024 / 1024)}MB`);
    }

    if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
      errors.push(`File type not allowed. Accepted types: ${allowedTypes.join(', ')}`);
    }

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
      } as FileInfo
    };
  }

  static async validateConnectivity() {
    const errors: string[] = [];
    const checks: ConnectivityChecks = {};

    try {
      if (!navigator.onLine) {
        errors.push('No internet connection detected');
        checks.online = false;
      } else {
        checks.online = true;
      }

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
      } catch {
        checks.suiRpc = false;
        errors.push('Cannot connect to Sui blockchain service');
      }

      try {
        const walrusResponse = await fetch('/walrus-publisher', {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        checks.walrus = walrusResponse.ok;
        if (!walrusResponse.ok) {
          errors.push('Walrus storage service is unavailable');
        }
      } catch {
        checks.walrus = false;
        errors.push('Cannot connect to Walrus storage service');
      }

    } catch {
      errors.push('Network connectivity check failed');
    }

    return {
      isValid: errors.length === 0,
      errors,
      checks
    };
  }

  static sanitizeInput(input: unknown): string {
    if (typeof input !== 'string') return String(input || '');

    return input
      .trim()
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .slice(0, 1000);
  }

  static validateAndSanitizeForm(formData: FormData, availableTemplates: Template[] = []) {
    const sanitizedData: CreationRequest = {
      title: this.sanitizeInput(formData.title),
      template: this.sanitizeInput(formData.template),
      walletAddress: formData.walletAddress,
      timestamp: formData.timestamp
    };

    return this.validateCreationRequest(sanitizedData, availableTemplates);
  }
}

export default SpreadsheetValidation;
