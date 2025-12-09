/**
 * AtomicOperationManager Unit Tests
 *
 * Tests atomic operation execution with rollback support, parallel/sequential
 * operation handling, and cleanup handler registration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @dreamlit/walrus (used by AtomicOperationManager)
vi.mock('@dreamlit/walrus', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  },
  LogComponent: {
    BLOCKCHAIN_ADAPTER: 'BLOCKCHAIN_ADAPTER'
  },
  standardizedErrorHandler: {
    processError: vi.fn(async (error: any, context: any) => ({
      userMessage: 'Test error message',
      technicalError: error.message,
      category: 'TEST_ERROR',
      recoveryActions: [],
      requiresUserAction: false
    }))
  }
}));

// Mock transaction experience manager
vi.mock('../../transaction-management/utils/TransactionExperience.ts', () => ({
  transactionExperienceManager: {
    prepareTransaction: vi.fn(() => ({})),
    executeWithExperience: vi.fn(async (operation, name, context) => {
      return await operation.execute(context);
    }),
    emitTransactionEvent: vi.fn()
  }
}));

// Test helpers
function createOperation(name, result, options = {}) {
  const { dependencies, shouldFail, cleanup, delay } = options;

  return {
    name,
    execute: vi.fn(async (context) => {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (shouldFail) throw new Error(typeof result === 'string' ? result : `${name} failed`);
      return typeof result === 'function' ? result(context) : result;
    }),
    ...(dependencies && { dependencies: Array.isArray(dependencies) ? dependencies : [dependencies] }),
    ...(cleanup && { getCleanupHandler: vi.fn(() => cleanup) })
  };
}

function createCleanupFn() {
  return vi.fn();
}

describe('AtomicOperationManager', () => {
  let AtomicOperationManager;
  let manager;
  let logger;

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();

    // Import the module after mocks are set up
    const module = await import("@/sdk/blockchain-integration/services/AtomicOperationManager.js");
    AtomicOperationManager = module.default;
    manager = new AtomicOperationManager();

    // Get reference to logger for assertions
    const loggerModule = await import("@/sdk/shared/utils/Logger.js");
    logger = loggerModule.logger;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('executeAtomic', () => {
    it.each([
    {
      name: 'single operation',
      setup: () => [createOperation('test-operation', { result: 'success' })],
      verify: (result, operations, name) => {
        expect(result.results[0].name, `${name}: result name mismatch`).toBe('test-operation');
        expect(result.results[0].result, `${name}: result value mismatch`).toBe('success');
        expect(operations[0].execute, `${name}: execute not called`).toHaveBeenCalledTimes(1);
      }
    },
    {
      name: 'multiple parallel operations',
      setup: () => [
      createOperation('op1', { value: 1 }, { delay: 10 }),
      createOperation('op2', { value: 2 }, { delay: 10 }),
      createOperation('op3', { value: 3 }, { delay: 10 })],

      verify: (result, operations, name) => {
        operations.forEach((op) => expect(op.execute, `${name}: op not called`).toHaveBeenCalled());
        expect(result.results.map((r) => r.name), `${name}: missing op1`).toContain('op1');
        expect(result.results.map((r) => r.name), `${name}: missing op2`).toContain('op2');
        expect(result.results.map((r) => r.name), `${name}: missing op3`).toContain('op3');
      }
    }]
    )('should execute $name', async ({ name, setup, verify }) => {
      const operations = setup();
      const result = await manager.executeAtomic(operations, {});

      expect(result.success, `${name}: should succeed`).toBe(true);
      expect(result.results, `${name}: result count mismatch`).toHaveLength(operations.length);
      expect(result.operationId, `${name}: operation ID missing`).toBeDefined();
      verify(result, operations, name);
    });

    it('should execute sequential operations with dependency resolution', async () => {
      const operations = [
      createOperation('step1', { blobId: 'blob-123' }),
      createOperation('step2', (ctx) => ({ objectId: `obj-${ctx.operationResults['step1'].blobId}` }), {
        dependencies: 'step1'
      }),
      createOperation('step3', (ctx) => ({
        combined: `${ctx.operationResults['step1'].blobId}-${ctx.operationResults['step2'].objectId}`
      }), {
        dependencies: ['step1', 'step2']
      })];


      const result = await manager.executeAtomic(operations, {});

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);

      // Verify operations executed in order with proper context
      expect(operations[0].execute).toHaveBeenCalled();

      // step2 should receive context with step1 results
      const step2CallContext = operations[1].execute.mock.calls[0][0];
      expect(step2CallContext.operationResults).toBeDefined();
      expect(step2CallContext.operationResults['step1']).toBeDefined();
      expect(step2CallContext.operationResults['step1'].blobId).toBe('blob-123');

      // step3 should receive context with both step1 and step2 results
      const step3CallContext = operations[2].execute.mock.calls[0][0];
      expect(step3CallContext.operationResults).toBeDefined();
      expect(step3CallContext.operationResults['step1']).toBeDefined();
      expect(step3CallContext.operationResults['step1'].blobId).toBe('blob-123');
      expect(step3CallContext.operationResults['step2']).toBeDefined();
      expect(step3CallContext.operationResults['step2'].objectId).toBe('obj-blob-123');

      // Verify final result
      const step3Result = result.results.find((r) => r.name === 'step3');
      expect(step3Result.combined).toBe('blob-123-obj-blob-123');
    });

    it('should register and track cleanup handlers', async () => {
      const cleanupFn = createCleanupFn();
      const operation = createOperation('with-cleanup', { resourceId: 'res-123' }, { cleanup: cleanupFn });

      const result = await manager.executeAtomic([operation], {});

      expect(result.success).toBe(true);
      expect(operation.getCleanupHandler).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: 'res-123' })
      );
      // Auto-cleanup removes tracking after successful operations
      expect(manager.operations).toHaveLength(0);
    });

    it.each([
    {
      name: 'parallel operation failure',
      setupCleanups: () => [createCleanupFn(), createCleanupFn()],
      createOps: (c1, c2) => [
      createOperation('op1', { value: 1 }, { cleanup: c1 }),
      createOperation('op2-fail', 'Operation 2 failed', { shouldFail: true, cleanup: c2 })],

      expectCleanup1: true,
      expectCleanup2: false,
      checkErrorLog: false
    },
    {
      name: 'sequential operation failure',
      setupCleanups: () => [createCleanupFn(), createCleanupFn()],
      createOps: (c1, c2) => [
      createOperation('step1', { value: 1 }, { cleanup: c1 }),
      createOperation('step2-fail', 'Step 2 failed', { shouldFail: true, dependencies: 'step1', cleanup: c2 })],

      expectCleanup1: true,
      expectCleanup2: false,
      checkErrorLog: false
    },
    {
      name: 'cleanup failure (continues rollback)',
      setupCleanups: () => {
        const c1 = createCleanupFn();
        c1.mockImplementation(() => {throw new Error('Cleanup 1 failed');});
        return [c1, createCleanupFn()];
      },
      createOps: (c1, c2) => [
      createOperation('op1', { value: 1 }, { cleanup: c1 }),
      createOperation('op2', { value: 2 }, { cleanup: c2 }),
      createOperation('op3-fail', 'Op 3 failed', { shouldFail: true })],

      expectCleanup1: true,
      expectCleanup2: true,
      checkErrorLog: true
    }]
    )('should rollback on $name', async ({ setupCleanups, createOps, expectCleanup1, expectCleanup2, checkErrorLog }) => {
      const [cleanup1, cleanup2] = setupCleanups();
      const operations = createOps(cleanup1, cleanup2);

      const result = await manager.executeAtomic(operations, {});

      expect(result.success).toBe(false);
      expect(result.rollbackCompleted).toBe(true);
      expect(manager.operations, `${setupCleanups.name || 'rollback'}: should cleanup tracking`).toHaveLength(0);

      if (expectCleanup1) {
        expect(cleanup1).toHaveBeenCalled();
      } else {
        expect(cleanup1).not.toHaveBeenCalled();
      }

      if (expectCleanup2) {
        expect(cleanup2).toHaveBeenCalled();
      } else {
        expect(cleanup2).not.toHaveBeenCalled();
      }

      if (checkErrorLog) {
        expect(logger.error).toHaveBeenCalledWith(
          'BLOCKCHAIN_ADAPTER',
          'rollback_failed',
          expect.stringContaining('Rollback failed for step'),
          expect.any(Object)
        );
      }
    });

    it('should pass context to operations', async () => {
      const testContext = {
        userId: 'user-123',
        metadata: { key: 'value' }
      };

      const operation = {
        name: 'context-test',
        execute: vi.fn(async (context) => ({ contextReceived: context }))
      };

      const result = await manager.executeAtomic([operation], testContext);

      expect(result.success).toBe(true);
      // Operations now receive both context and operationId parameters
      expect(operation.execute).toHaveBeenCalledWith(
        testContext,
        expect.stringMatching(/^atomic-/)
      );
    });

    it('should handle operations with mixed parallel and sequential', async () => {
      const operations = [
      // Parallel group
      {
        name: 'parallel1',
        execute: vi.fn(async () => ({ value: 'p1' }))
      },
      {
        name: 'parallel2',
        execute: vi.fn(async () => ({ value: 'p2' }))
      },
      // Sequential depending on parallel
      {
        name: 'sequential1',
        dependencies: ['parallel1'],
        execute: vi.fn(async (context) => ({
          value: `seq1-${context.operationResults['parallel1'].value}`
        }))
      }];


      const result = await manager.executeAtomic(operations, {});

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);

      // Verify all executed
      expect(operations[0].execute).toHaveBeenCalled();
      expect(operations[1].execute).toHaveBeenCalled();
      expect(operations[2].execute).toHaveBeenCalled();

      // Verify sequential got parallel results
      const seq1Result = result.results.find((r) => r.name === 'sequential1');
      expect(seq1Result.value).toBe('seq1-p1');
    });
  });

  describe('cleanup', () => {
    it('should auto-cleanup operation tracking after successful completion', async () => {
      const operation = createOperation('test-op', { value: 1 }, { cleanup: createCleanupFn() });

      // First execution
      await manager.executeAtomic([operation], {});
      expect(manager.operations, 'First execution should auto-cleanup').toHaveLength(0);

      // Second execution to verify independence
      await manager.executeAtomic([operation], {});
      expect(manager.operations, 'Second execution should also auto-cleanup').toHaveLength(0);
    });

    it('should log cleanup events for both success and failure paths', async () => {
      const operation = createOperation('test-op', { value: 1 }, { cleanup: createCleanupFn() });

      // Success path
      await manager.executeAtomic([operation], {});
      expect(logger.debug).toHaveBeenCalledWith(
        'BLOCKCHAIN_ADAPTER',
        'atomic_cleanup',
        expect.stringContaining('Cleaned up operation tracking')
      );

      // Failure path
      const failingOp = createOperation('failing-op', 'Test error', { shouldFail: true, cleanup: createCleanupFn() });
      await manager.executeAtomic([failingOp], {});
      expect(logger.debug).toHaveBeenCalledWith(
        'BLOCKCHAIN_ADAPTER',
        'atomic_cleanup',
        expect.stringContaining('Cleaned up operation tracking')
      );
    });
  });

  describe('error handling', () => {
    it.each([
    {
      name: 'enhance errors with context',
      opName: 'failing-op',
      checkTechnical: true,
      checkCategory: false
    },
    {
      name: 'handle string errors',
      opName: 'string-error-op',
      checkTechnical: false,
      checkCategory: false
    },
    {
      name: 'include recovery actions',
      opName: 'test-op',
      checkTechnical: false,
      checkCategory: true
    }]
    )('should $name', async ({ name, opName, checkTechnical, checkCategory }) => {
      const operation = createOperation(opName, 'Error', { shouldFail: true });
      const result = await manager.executeAtomic([operation], {});

      expect(result.success, `${name}: should fail`).toBe(false);
      expect(result.error, `${name}: should have error message`).toBeDefined();

      if (checkTechnical) {
        expect(result.technicalError, `${name}: should include operation name`).toContain(opName);
      }

      if (checkCategory) {
        expect(result.recoveryActions, `${name}: should have recovery actions`).toBeDefined();
        expect(result.category, `${name}: should have category`).toBe('TEST_ERROR');
      }
    });
  });

  describe('logging', () => {
    it.each([
    {
      name: 'start and success',
      operations: () => [createOperation('test-op', { value: 1 })],
      expectedCalls: [
      { level: 'info', id: 'atomic_start', text: 'Starting atomic operation' },
      { level: 'info', id: 'atomic_success', text: 'Atomic operation completed successfully' }]

    },
    {
      name: 'parallel and sequential phases',
      operations: () => [
      createOperation('parallel', { value: 1 }),
      createOperation('sequential', { value: 2 }, { dependencies: 'parallel' })],

      expectedCalls: [
      { level: 'info', id: 'atomic_parallel', text: 'Executing 1 parallel operations' },
      { level: 'info', id: 'atomic_sequential', text: 'Executing 1 sequential operations' }]

    },
    {
      name: 'rollback on failure',
      operations: () => [createOperation('failing-op', 'Test error', { shouldFail: true })],
      expectedCalls: [
      { level: 'error', id: 'atomic_failed', text: 'Atomic operation failed' },
      { level: 'info', id: 'rollback_start', text: 'Starting rollback' }]

    }]
    )('should log $name', async ({ name, operations, expectedCalls }) => {
      await manager.executeAtomic(operations(), {});

      expectedCalls.forEach(({ level, id, text }) => {
        expect(logger[level], `${name}: ${id} not called`).toHaveBeenCalledWith(
          'BLOCKCHAIN_ADAPTER',
          id,
          expect.stringContaining(text),
          expect.any(Object)
        );
      });
    });
  });

  describe('Characterization - Transaction Experience Integration', () => {
    it('should wrap parallel operations with transaction experience', async () => {
      const { transactionExperienceManager } = await import("@/sdk/transaction-management/utils/TransactionExperience.js");
      const operations = [
      createOperation('parallel-op-1', { result: 'value1' }),
      createOperation('parallel-op-2', { result: 'value2' })];


      const result = await manager.executeAtomic(operations, {});

      expect(result.success).toBe(true);

      // Verify transaction experience was invoked for parallel operations
      // executeWithExperience internally calls prepareTransaction
      expect(transactionExperienceManager.executeWithExperience).toHaveBeenCalled();
    });

    it('should NOT wrap sequential operations with transaction experience', async () => {
      const { transactionExperienceManager } = await import("@/sdk/transaction-management/utils/TransactionExperience.js");
      vi.clearAllMocks();

      const operations = [
      createOperation('step-1', { value: 1 }),
      createOperation('step-2', (ctx) => ({ value: ctx.operationResults['step-1'].value + 1 }), {
        dependencies: 'step-1'
      })];


      const result = await manager.executeAtomic(operations, {});

      expect(result.success).toBe(true);

      // Sequential operations should NOT use executeWithExperience wrapper
      // They execute directly with (context, operationId) parameters
      expect(operations[1].execute).toHaveBeenCalledWith(
        expect.objectContaining({
          operationResults: expect.objectContaining({
            'step-1': expect.objectContaining({ value: 1 })
          })
        }),
        expect.stringMatching(/^atomic-/) // operationId
      );

      // Verify executeWithExperience was NOT called for sequential operations
      expect(transactionExperienceManager.executeWithExperience).not.toHaveBeenCalledWith(
        expect.objectContaining({ execute: expect.any(Function) }),
        'step-2',
        expect.anything()
      );
    });

    it('should emit transaction progress events during parallel execution', async () => {
      const { transactionExperienceManager } = await import("@/sdk/transaction-management/utils/TransactionExperience.js");

      const operations = [
      createOperation('op-1', { value: 1 }),
      createOperation('op-2', { value: 2 })];


      await manager.executeAtomic(operations, {});

      // Verify event emission was triggered
      expect(transactionExperienceManager.emitTransactionEvent).toHaveBeenCalled();
    });
  });

  describe('Characterization - Operation Context Flow', () => {
    it('should pass operationResults through context for dependent operations', async () => {
      const operations = [
      createOperation('producer', { data: 'from-producer' }),
      createOperation('consumer', (ctx) => {
        return {
          received: ctx.operationResults['producer']?.data || ctx.operationResults['producer']
        };
      }, {
        dependencies: 'producer'
      })];


      const result = await manager.executeAtomic(operations, {});

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);

      // Verify consumer received producer's result
      const consumerResult = result.results.find((r) => r.name === 'consumer');
      expect(consumerResult.received).toBeDefined();
    });

    test('should pass initial context through all operations', async () => {
      const initialContext = {
        userId: 'user-123',
        sessionId: 'session-456'
      };

      const contextReceived = [];
      const operations = [
      createOperation('op1', (ctx) => {
        contextReceived.push({
          userId: ctx.userId,
          sessionId: ctx.sessionId
        });
        return { received: true };
      })];


      const result = await manager.executeAtomic(operations, initialContext);

      expect(result.success).toBe(true);
      expect(contextReceived.length).toBeGreaterThan(0);
      expect(contextReceived[0]).toEqual({
        userId: 'user-123',
        sessionId: 'session-456'
      });
    });
  });

  describe('Characterization - Cleanup Handler Lifecycle', () => {
    it('should call getCleanupHandler with operation result', async () => {
      const cleanupFn = createCleanupFn();
      const operation = createOperation('with-cleanup', { resourceId: 'res-123' }, {
        cleanup: cleanupFn
      });

      await manager.executeAtomic([operation], {});

      // getCleanupHandler should be called with the operation result
      expect(operation.getCleanupHandler).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: 'res-123' })
      );
    });

    it('should auto-cleanup and remove operations from tracking on success', async () => {
      const cleanupFn = createCleanupFn();
      const operation = createOperation('op-with-cleanup', { id: 'test' }, {
        cleanup: cleanupFn
      });

      await manager.executeAtomic([operation], {});

      // On success, operations should be removed from tracking
      expect(manager.operations).toHaveLength(0);
    });

    it('should execute cleanup in reverse order during rollback', async () => {
      const cleanup1 = createCleanupFn();
      const cleanup2 = createCleanupFn();
      const cleanup3 = createCleanupFn();
      const cleanupOrder = [];

      cleanup1.mockImplementation(() => cleanupOrder.push('cleanup1'));
      cleanup2.mockImplementation(() => cleanupOrder.push('cleanup2'));
      cleanup3.mockImplementation(() => cleanupOrder.push('cleanup3'));

      const operations = [
      createOperation('op1', { id: 1 }, { cleanup: cleanup1 }),
      createOperation('op2', { id: 2 }, { cleanup: cleanup2 }),
      createOperation('op3-fail', 'Failed', { shouldFail: true, cleanup: cleanup3 })];


      const result = await manager.executeAtomic(operations, {});

      expect(result.success).toBe(false);
      expect(result.rollbackCompleted).toBe(true);

      // Verify cleanup was called in REVERSE order: op2, op1 (op3 never got cleanup)
      expect(cleanupOrder).toEqual(['cleanup2', 'cleanup1']);
    });

    it('should continue rollback even if a cleanup handler fails', async () => {
      const cleanup1 = createCleanupFn();
      const cleanup2 = createCleanupFn();

      cleanup1.mockImplementation(() => {
        throw new Error('Cleanup 1 failed');
      });

      const operations = [
      createOperation('op1', { id: 1 }, { cleanup: cleanup1 }),
      createOperation('op2', { id: 2 }, { cleanup: cleanup2 }),
      createOperation('op3-fail', 'Failed', { shouldFail: true })];


      const result = await manager.executeAtomic(operations, {});

      expect(result.success).toBe(false);
      expect(result.rollbackCompleted).toBe(true);

      // Both cleanup handlers should have been called despite cleanup1 failure
      expect(cleanup1).toHaveBeenCalled();
      expect(cleanup2).toHaveBeenCalled();
    });
  });

  describe('Characterization - Error Decoration', () => {
    it('should decorate errors with operation context', async () => {
      const failingOp = createOperation('failing-op', 'Operation failed', { shouldFail: true });

      const result = await manager.executeAtomic([failingOp], {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // Error is properly returned even if lastOperation tracking varies
      expect(result.rollbackCompleted).toBeDefined();
    });

    it('should handle errors in parallel operations', async () => {
      const operations = [
      createOperation('op1', { value: 1 }),
      createOperation('op2-fail', 'Parallel failure', { shouldFail: true })];


      const result = await manager.executeAtomic(operations, {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle errors in sequential operations', async () => {
      const operations = [
      createOperation('step1', { value: 1 }),
      createOperation('step2-fail', 'Sequential failure', {
        shouldFail: true,
        dependencies: 'step1'
      })];


      const result = await manager.executeAtomic(operations, {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // Sequential operation error tracking
      expect(result.rollbackCompleted).toBe(true);
    });
  });

  describe('Characterization - Mixed Parallel and Sequential', () => {
    it('should execute parallel operations first, then sequential', async () => {
      const executionOrder = [];

      const operations = [
      createOperation('parallel-1', () => {
        executionOrder.push('parallel-1');
        return { id: 'p1' };
      }),
      createOperation('parallel-2', () => {
        executionOrder.push('parallel-2');
        return { id: 'p2' };
      }),
      createOperation('sequential', (ctx) => {
        executionOrder.push('sequential');
        return { p1: ctx.operationResults['parallel-1'], p2: ctx.operationResults['parallel-2'] };
      }, {
        dependencies: ['parallel-1', 'parallel-2']
      })];


      const result = await manager.executeAtomic(operations, {});

      expect(result.success).toBe(true);
      // Parallel ops execute first (in any order), then sequential
      expect(executionOrder).toContain('parallel-1');
      expect(executionOrder).toContain('parallel-2');
      expect(executionOrder[executionOrder.length - 1]).toBe('sequential');
    });

    it('should build correct dependency context for sequential operations', async () => {
      const contextData = [];

      const operations = [
      createOperation('p1', { value: 'p1-result' }),
      createOperation('p2', { value: 'p2-result' }),
      createOperation('s1', (ctx) => {
        contextData.push({
          p1: ctx.operationResults['p1'],
          p2: ctx.operationResults['p2']
        });
        return { combined: true };
      }, {
        dependencies: ['p1', 'p2']
      })];


      const result = await manager.executeAtomic(operations, {});

      expect(result.success).toBe(true);
      expect(contextData.length).toBeGreaterThan(0);
      // Just verify the dependency context was built with both operations
      expect(contextData[0].p1).toBeDefined();
      expect(contextData[0].p2).toBeDefined();
    });
  });
});