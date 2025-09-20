declare module '@grpc/grpc-js' {
  export interface GrpcObject {
    [key: string]: any;
  }
  
  export interface ProtobufTypeDefinition {
    [key: string]: any;
  }
  
  export interface ServiceClientConstructor {
    new (...args: any[]): any;
    [key: string]: any;
  }
  
  export function loadPackageDefinition(definition: any): GrpcObject;
}

declare module '@grpc/proto-loader' {
  export function loadSync(filename: string, options?: any): any;
}

// Sui blockchain types
declare module '@mysten/sui.js/client' {
  export interface SuiEvent {
    id: any;
    packageId: string;
    transactionModule: string;
    sender: string;
    type: string;
    parsedJson: any;
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
      [key: string]: any;
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