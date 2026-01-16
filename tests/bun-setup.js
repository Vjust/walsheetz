/**
 * Bun Test Setup
 */

// Register happy-dom if available
try {
  const { GlobalRegistrator } = await import('@happy-dom/global-registrator');
  GlobalRegistrator.register();
  console.log('Happy-DOM globals registered successfully');
} catch (error) {
  console.warn('Happy-DOM not available, using default test environment');
}

// Setup global test helpers
globalThis.beforeAll = globalThis.beforeAll || function() {};
globalThis.afterAll = globalThis.afterAll || function() {};
globalThis.beforeEach = globalThis.beforeEach || function() {};
globalThis.afterEach = globalThis.afterEach || function() {};

console.log('Bun test environment ready');
