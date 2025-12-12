// Integrity verification: blob validation and comprehensive checks

export interface BlobIntegrityResult {
  success: boolean;
  blobId: string;
  accessible: boolean;
  integrityVerified?: boolean;
  verificationPerformed?: boolean;
  dataSize?: number;
  error?: string;
}

export interface IntegrityCheckStep {
  step: number;
  action: string;
  startTime: number;
  endTime?: number;
  result?: 'PASSED' | 'FAILED';
  error?: string;
  integrityVerified?: boolean;
  dataSize?: number;
  validationChecks?: Record<string, boolean>;
}

export interface ComprehensiveIntegrityReport {
  blobId: string;
  expectedHash?: string;
  metadata: Record<string, any>;
  startTime: number;
  endTime?: number;
  totalDuration?: number;
  steps: IntegrityCheckStep[];
  success: boolean;
  integrityVerified: boolean;
  error?: string;
}

/**
 * Verify blob accessibility and integrity
 */
export async function verifyBlobIntegrity(
  aggregatorUrl: string,
  blobId: string,
  expectedHash?: string,
  retrievalFn?: (blobId: string, expectedHash?: string) => Promise<any>
): Promise<BlobIntegrityResult> {
  try {
    // Make a HEAD request to get blob metadata without downloading
    const headController = new AbortController();
    const headTimeout = setTimeout(() => headController.abort(), 5000);

    const response = await fetch(`${aggregatorUrl}/v1/blobs/${blobId}`, {
      method: 'HEAD',
      signal: headController.signal
    });

    clearTimeout(headTimeout);

    if (!response.ok) {
      return {
        success: false,
        error: `Blob not accessible: HTTP ${response.status}`,
        blobId,
        accessible: false
      };
    }

    // If retrieval function provided, perform full verification
    if (retrievalFn) {
      const result = await retrievalFn(blobId, expectedHash);

      return {
        success: result.success,
        integrityVerified: result.integrityVerified,
        verificationPerformed: result.verificationPerformed,
        blobId,
        accessible: true,
        dataSize: result.size,
        error: result.error
      };
    }

    return {
      success: true,
      integrityVerified: false,
      verificationPerformed: false,
      blobId,
      accessible: true
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMsg,
      blobId,
      accessible: false,
      integrityVerified: false
    };
  }
}

/**
 * Perform comprehensive integrity check with detailed reporting
 */
export async function performComprehensiveIntegrityCheck(
  aggregatorUrl: string,
  blobId: string,
  expectedHash: string | null,
  retrievalFn: (blobId: string, expectedHash?: string) => Promise<any>,
  metadata: Record<string, any> = {}
): Promise<ComprehensiveIntegrityReport> {
  const startTime = Date.now();
  const report: ComprehensiveIntegrityReport = {
    blobId,
    expectedHash: expectedHash ? expectedHash.substring(0, 16) + '...' : undefined,
    metadata,
    startTime,
    steps: [],
    success: false,
    integrityVerified: false
  };

  try {
    // Step 1: Check blob accessibility
    report.steps.push({ step: 1, action: 'Checking blob accessibility', startTime: Date.now() });

    const headCtl = new AbortController();
    const headT = setTimeout(() => headCtl.abort(), 5000);

    const headResponse = await fetch(`${aggregatorUrl}/v1/blobs/${blobId}`, {
      method: 'HEAD',
      signal: headCtl.signal
    });

    clearTimeout(headT);

    if (!headResponse.ok) {
      report.steps[0].result = 'FAILED';
      report.steps[0].error = `HTTP ${headResponse.status}: ${headResponse.statusText}`;
      report.steps[0].endTime = Date.now();
      report.error = `Blob not accessible: ${headResponse.status}`;
      report.endTime = Date.now();
      report.totalDuration = report.endTime - report.startTime;
      return report;
    }

    report.steps[0].result = 'PASSED';
    report.steps[0].endTime = Date.now();

    // Step 2: Retrieve and verify content
    report.steps.push({ step: 2, action: 'Retrieving and verifying content', startTime: Date.now() });

    const retrievalResult = await retrievalFn(blobId, expectedHash || undefined);

    if (!retrievalResult.success) {
      report.steps[1].result = 'FAILED';
      report.steps[1].error = retrievalResult.error;
      report.steps[1].endTime = Date.now();
      report.error = retrievalResult.error;
      report.endTime = Date.now();
      report.totalDuration = report.endTime - report.startTime;
      return report;
    }

    report.steps[1].result = retrievalResult.integrityVerified ? 'PASSED' : 'FAILED';
    report.steps[1].endTime = Date.now();
    report.steps[1].integrityVerified = retrievalResult.integrityVerified;
    report.steps[1].dataSize = retrievalResult.size;

    // Step 3: Validate data structure
    report.steps.push({ step: 3, action: 'Validating data structure', startTime: Date.now() });

    try {
      const data = retrievalResult.data;
      const validationChecks = {
        hasValidStructure: !!(data && typeof data === 'object'),
        hasTimestamp: !!data.timestamp,
        hasSpreadsheetId: !!data.spreadsheetId,
        hasVersion: !!data.version,
        hasMetadata: !!data.metadata
      };

      report.steps[2].result = validationChecks.hasValidStructure ? 'PASSED' : 'FAILED';
      report.steps[2].validationChecks = validationChecks;
      report.steps[2].endTime = Date.now();
    } catch (validationError) {
      report.steps[2].result = 'FAILED';
      report.steps[2].error = validationError instanceof Error ? validationError.message : String(validationError);
      report.steps[2].endTime = Date.now();
    }

    // Final assessment
    report.success = retrievalResult.success;
    report.integrityVerified = retrievalResult.integrityVerified;
    report.endTime = Date.now();
    report.totalDuration = report.endTime - report.startTime;

    return report;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    report.endTime = Date.now();
    report.totalDuration = report.endTime - report.startTime;
    return report;
  }
}
