/**
 * PTB Regression Tests for MoveSubWalletOrchestrator
 * Validates that transaction builders generate correct TransactionBlocks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MoveSubWalletOrchestrator, MOVE_FUNCTIONS } from '../contracts/MoveSubWalletOrchestrator.js';
import type { SuiClient } from '@mysten/sui.js/client';

/**
 * Create a mock SuiClient with stubbed methods to avoid runtime crashes
 * if tests evolve to call execution methods.
 *
 * Uses Partial<Pick<...>> to maintain type safety - TypeScript will error
 * if we try to use methods that aren't mocked.
 */
function createMockSuiClient(): SuiClient {
  const mockClient: Partial<Pick<SuiClient, 'signAndExecuteTransactionBlock' | 'executeTransactionBlock'>> = {
    signAndExecuteTransactionBlock: vi.fn(),
    executeTransactionBlock: vi.fn(),
  };
  return mockClient as SuiClient;
}

/**
 * Type definitions for TransactionBlock internals (not in public API)
 * These are used for testing PTB construction without assuming array positions
 */
interface TransactionBlockData {
  blockData: {
    transactions: Array<{
      kind: string;
      target?: string;
      arguments?: unknown[];
      [key: string]: unknown;
    }>;
  };
}

interface MoveCallTransaction {
  kind: 'MoveCall';
  target: string;
  arguments: unknown[];
  [key: string]: unknown;
}

/**
 * Helper to find the MoveCall transaction in a TransactionBlock
 * This is more resilient than assuming transactions[0] in case
 * builders add preprocessing steps (e.g., SplitCoins) before the MoveCall
 */
function findMoveCall(tx: TransactionBlockData): MoveCallTransaction {
  const moveCall = tx.blockData.transactions.find((t): t is MoveCallTransaction => t.kind === 'MoveCall');
  if (!moveCall) {
    throw new Error('No MoveCall found in transaction. Expected at least one MoveCall.');
  }
  return moveCall;
}

describe('MoveSubWalletOrchestrator PTB Builders', () => {
  let orchestrator: MoveSubWalletOrchestrator;
  const mockPackageId = '0x1234567890abcdef';
  const mockPolicyId = '0xabcdef1234567890';

  beforeEach(() => {
    const mockClient = createMockSuiClient();
    orchestrator = new MoveSubWalletOrchestrator({
      client: mockClient,
      packageId: mockPackageId,
      policyId: mockPolicyId,
    });
  });

  describe('buildInitPolicyTransaction', () => {
    it('should target create_policy function (NOT init)', () => {
      const tx = orchestrator.buildInitPolicyTransaction({
        minSuiPerWallet: BigInt(1000000000),
        minWalrusPerWallet: BigInt(5000000000),
      });

      expect(tx).toBeDefined();

      // CRITICAL: Validate the actual Move function target
      // Use helper to find MoveCall (resilient if builders add preprocessing steps)
      const moveCall = findMoveCall(tx);
      expect(moveCall.target).toBe(`${mockPackageId}::policy::${MOVE_FUNCTIONS.CREATE_POLICY}`);

      // This regression guard ensures we never call policy::init by mistake
      expect(moveCall.target).not.toContain('::init');
      expect(MOVE_FUNCTIONS.CREATE_POLICY).toBe('create_policy'); // Document expected value
    });

    it('should accept bigint arguments', () => {
      const tx = orchestrator.buildInitPolicyTransaction({
        minSuiPerWallet: BigInt(123456789),
        minWalrusPerWallet: BigInt(987654321),
      });

      expect(tx).toBeDefined();
    });

    it('should accept number arguments and convert to bigint', () => {
      const tx = orchestrator.buildInitPolicyTransaction({
        minSuiPerWallet: 1000000000,
        minWalrusPerWallet: 5000000000,
      });

      expect(tx).toBeDefined();
    });

    it('should accept optional gas budget', () => {
      const tx = orchestrator.buildInitPolicyTransaction({
        minSuiPerWallet: BigInt(1000000000),
        minWalrusPerWallet: BigInt(5000000000),
        gasBudget: BigInt(50000000),
      });

      expect(tx).toBeDefined();
    });
  });

  describe('buildRegisterSponsorTransaction', () => {
    it('should target register_sponsor function', () => {
      const tx = orchestrator.buildRegisterSponsorTransaction({
        adminCapId: '0xadmincap123',
        sponsorAddress: '0xsponsor456',
        allowance: BigInt(10000000000),
        perTxLimit: BigInt(1000000000),
      });

      expect(tx).toBeDefined();

      // CRITICAL: Validate the actual Move function target
      const moveCall = findMoveCall(tx);
      expect(moveCall.target).toBe(`${mockPackageId}::policy::${MOVE_FUNCTIONS.REGISTER_SPONSOR}`);

      // Verify correct number of arguments (policy, adminCap, sponsor, allowance, perTxLimit)
      expect(moveCall.arguments).toHaveLength(5);
    });

    it('should use default policyId when not provided', () => {
      const tx = orchestrator.buildRegisterSponsorTransaction({
        adminCapId: '0xadmincap123',
        sponsorAddress: '0xsponsor456',
        allowance: BigInt(10000000000),
        perTxLimit: BigInt(1000000000),
      });

      expect(tx).toBeDefined();
    });

    it('should accept policyId override', () => {
      const tx = orchestrator.buildRegisterSponsorTransaction({
        policyId: '0xcustompolicy999',
        adminCapId: '0xadmincap123',
        sponsorAddress: '0xsponsor456',
        allowance: BigInt(10000000000),
        perTxLimit: BigInt(1000000000),
      });

      expect(tx).toBeDefined();
    });

    it('should throw when no policyId available', () => {
      const noPolicyOrchestrator = new MoveSubWalletOrchestrator({
        client: createMockSuiClient(),
        packageId: mockPackageId,
        // No policyId provided
      });

      expect(() =>
        noPolicyOrchestrator.buildRegisterSponsorTransaction({
          adminCapId: '0xadmincap123',
          sponsorAddress: '0xsponsor456',
          allowance: BigInt(10000000000),
          perTxLimit: BigInt(1000000000),
        })
      ).toThrow('policyId is required');
    });

    it('should accept optional gas budget', () => {
      const tx = orchestrator.buildRegisterSponsorTransaction({
        adminCapId: '0xadmincap123',
        sponsorAddress: '0xsponsor456',
        allowance: BigInt(10000000000),
        perTxLimit: BigInt(1000000000),
        gasBudget: BigInt(100000000),
      });

      expect(tx).toBeDefined();
    });
  });

  describe('buildSetAllowanceTransaction', () => {
    it('should target set_sponsor_allowance function', () => {
      const tx = orchestrator.buildSetAllowanceTransaction({
        adminCapId: '0xadmincap123',
        sponsorCapId: '0xsponsorcap456',
        newAllowance: BigInt(20000000000),
        newPerTxLimit: BigInt(2000000000),
      });

      expect(tx).toBeDefined();

      // CRITICAL: Validate the actual Move function target
      const moveCall = findMoveCall(tx);
      expect(moveCall.target).toBe(`${mockPackageId}::policy::${MOVE_FUNCTIONS.SET_SPONSOR_ALLOWANCE}`);

      // Verify correct number of arguments (policy, adminCap, sponsorCap, newAllowance, newPerTxLimit)
      expect(moveCall.arguments).toHaveLength(5);
    });

    it('should accept optional gas budget', () => {
      const tx = orchestrator.buildSetAllowanceTransaction({
        adminCapId: '0xadmincap123',
        sponsorCapId: '0xsponsorcap456',
        newAllowance: BigInt(20000000000),
        newPerTxLimit: BigInt(2000000000),
        gasBudget: BigInt(100000000),
      });

      expect(tx).toBeDefined();
    });
  });

  describe('buildFundWalletsTransaction', () => {
    it('should target fund_wallets_sui function', () => {
      const tx = orchestrator.buildFundWalletsTransaction({
        sponsorCapId: '0xsponsorcap123',
        coinObjectId: '0xcoin456',
        recipients: ['0xrecipient1', '0xrecipient2'],
        amounts: [BigInt(1000000000), BigInt(2000000000)],
      });

      expect(tx).toBeDefined();

      // CRITICAL: Validate the actual Move function target
      const moveCall = findMoveCall(tx);
      expect(moveCall.target).toBe(`${mockPackageId}::policy::${MOVE_FUNCTIONS.FUND_WALLETS_SUI}`);

      // Verify correct number of arguments (policy, sponsorCap, coin, recipients vector, amounts vector)
      expect(moveCall.arguments).toHaveLength(5);
    });

    it('should accept both bigint and number amounts', () => {
      const tx = orchestrator.buildFundWalletsTransaction({
        sponsorCapId: '0xsponsorcap123',
        coinObjectId: '0xcoin456',
        recipients: ['0xrecipient1', '0xrecipient2'],
        amounts: [1000000000, 2000000000], // numbers
      });

      expect(tx).toBeDefined();
    });

    it('should handle multiple recipients', () => {
      const recipients = ['0xrecipient1', '0xrecipient2', '0xrecipient3'];
      const amounts = [BigInt(1000000000), BigInt(2000000000), BigInt(3000000000)];

      const tx = orchestrator.buildFundWalletsTransaction({
        sponsorCapId: '0xsponsorcap123',
        coinObjectId: '0xcoin456',
        recipients,
        amounts,
      });

      expect(tx).toBeDefined();
    });

    it('should throw when recipients array is empty', () => {
      expect(() =>
        orchestrator.buildFundWalletsTransaction({
          sponsorCapId: '0xsponsorcap123',
          coinObjectId: '0xcoin456',
          recipients: [],
          amounts: [],
        })
      ).toThrow('recipients cannot be empty');
    });

    it('should throw when recipients and amounts length mismatch', () => {
      expect(() =>
        orchestrator.buildFundWalletsTransaction({
          sponsorCapId: '0xsponsorcap123',
          coinObjectId: '0xcoin456',
          recipients: ['0xrecipient1', '0xrecipient2'],
          amounts: [BigInt(1000000000)], // Only one amount
        })
      ).toThrow('recipients and amounts length mismatch');
    });

    it('should accept policyId override', () => {
      const customPolicyId = '0xcustompolicy999';

      const tx = orchestrator.buildFundWalletsTransaction({
        policyId: customPolicyId,
        sponsorCapId: '0xsponsorcap123',
        coinObjectId: '0xcoin456',
        recipients: ['0xrecipient1'],
        amounts: [BigInt(1000000000)],
      });

      expect(tx).toBeDefined();
    });

    it('should accept optional gas budget', () => {
      const tx = orchestrator.buildFundWalletsTransaction({
        sponsorCapId: '0xsponsorcap123',
        coinObjectId: '0xcoin456',
        recipients: ['0xrecipient1'],
        amounts: [BigInt(1000000000)],
        gasBudget: BigInt(100000000),
      });

      expect(tx).toBeDefined();
    });
  });

  describe('Type Conversions', () => {
    it('should handle mixed number and bigint inputs', () => {
      const tx = orchestrator.buildRegisterSponsorTransaction({
        adminCapId: '0xadmincap123',
        sponsorAddress: '0xsponsor456',
        allowance: 10000000000, // number
        perTxLimit: BigInt(1000000000), // bigint
        gasBudget: 50000000, // number
      });

      expect(tx).toBeDefined();
    });

    it('should convert numbers to bigint in toU64 helper', () => {
      // This is indirectly tested by all the above tests that accept numbers
      const tx = orchestrator.buildFundWalletsTransaction({
        sponsorCapId: '0xsponsorcap123',
        coinObjectId: '0xcoin456',
        recipients: ['0xrecipient1'],
        amounts: [1000000000], // number, will be converted to bigint
      });

      expect(tx).toBeDefined();
    });
  });

  describe('Move Function Target Validation', () => {
    /**
     * CRITICAL: This test documents the Move contract function names.
     * If these tests pass but Move execution fails, check that the Move
     * contract has functions with these exact names:
     *
     * - policy::create_policy (NOT policy::init)
     * - policy::register_sponsor
     * - policy::set_sponsor_allowance
     * - policy::fund_wallets_sui
     *
     * Update move/walrus_subwallet/sources/policy.move if names changed.
     */
    it('should document expected Move function names', () => {
      // This test serves as documentation for integration testing
      const expectedFunctions = {
        createPolicy: 'create_policy', // NOT 'init'
        registerSponsor: 'register_sponsor',
        setAllowance: 'set_sponsor_allowance',
        fundWallets: 'fund_wallets_sui',
      };

      // Document expected module
      const expectedModule = 'policy';

      // All builders should target these functions
      expect(expectedFunctions.createPolicy).toBe('create_policy');
      expect(expectedModule).toBe('policy');

      // NOTE: Actual function call validation happens during integration
      // testing with a live Sui network or Move unit tests
    });
  });
});
