declare module '@grpc/grpc-js' {
  export interface GrpcObject {
    [key: string]: unknown;
  }
  
  export interface ProtobufTypeDefinition {
    [key: string]: unknown;
  }
  
  export interface ServiceClientConstructor {
    new (...args: unknown[]): unknown;
    [key: string]: unknown;
  }
  
  export function loadPackageDefinition(definition: unknown): GrpcObject;
}

declare module '@grpc/proto-loader' {
  export function loadSync(filename: string, options?: Record<string, unknown>): unknown;
}

// Sui blockchain types
declare module '@mysten/sui.js/client' {
  export interface SuiEvent {
    id: {
      txDigest: string;
      eventSeq: string;
    };
    packageId: string;
    transactionModule: string;
    sender: string;
    type: string;
    parsedJson: Record<string, unknown>;
    bcs: string;
    timestampMs?: string;
    digest?: string;
  }
}

// Gas estimator configuration types
declare global {
  interface GasEstimatorConfig {
    gasQueries?: {
      endpoint: string;
      [key: string]: unknown;
    };
    computationBuckets?: number[];
    storageUnitsPerByte?: number;
    storageRebatePercentage?: number;
    gasBuffer?: number;
    minGasBudget?: number;
    maxGasBudget?: number;
    mistPerSui?: number;
    estimatedGasCosts?: {
      [key: string]: string;
    };
  }
}

export {};