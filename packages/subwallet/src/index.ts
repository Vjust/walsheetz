/**
 * @walrus/subwallet-sdk
 * Reusable SDK for sub-wallet orchestration on Sui/Walrus
 * Works in both Node.js and browser environments
 */

// Main orchestrator
export { SubWalletOrchestrator } from './SubWalletOrchestrator.js';
export type { OrchestratorConfig } from './SubWalletOrchestrator.js';

// Core modules
export { SubWalletManager } from './sub-wallet-walrus/core/SubWalletManager.js';
export { SponsoredTransactions } from './sub-wallet-walrus/core/SponsoredTransactions.js';
export { MoveSubWalletOrchestrator } from './sub-wallet-walrus/contracts/MoveSubWalletOrchestrator.js';
export type {
  MoveSubWalletConfig,
  FundWalletsParams as MoveFundWalletsParams,
  RegisterSponsorParams as MoveRegisterSponsorParams,
  SetAllowanceParams as MoveSetAllowanceParams,
} from './sub-wallet-walrus/contracts/MoveSubWalletOrchestrator.js';

// Storage adapters
export { MemoryStorageAdapter } from './sub-wallet-walrus/storage/memory-adapter.js';
export { NodeFsStorageAdapter } from './sub-wallet-walrus/storage/node-fs-adapter.js';

// Types
export type {
  WalletMetadata,
  WalletBalance,
  TransferResult,
  StorageAdapter,
  SubWalletConfig,
  FundOptions,
  SweepOptions,
  SponsorConfig,
} from './types.js';

// CLI wrappers
export { runSuiCli, suiMoveCall, suiClientPTB } from './sub-wallet-walrus/wrappers/suiCli.js';
export { runWalrusCli, walrusPublisherStore, walrusPublisherUploadDir } from './sub-wallet-walrus/wrappers/walrusCli.js';

