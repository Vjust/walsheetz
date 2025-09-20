#!/usr/bin/env node

// Manual smoke test for rate limiter functionality
import RateLimiter from '../blockchain/utils/rateLimiter.js';

console.log('🧪 Testing Rate Limiter Implementation...\n');

async function testTokenBucket() {
  console.log('📊 Test 1: Token Bucket Algorithm');
  const limiter = new RateLimiter({
    name: 'test-bucket',
    maxRPS: 2,
    burst: 4,
    maxConcurrent: 2
  });
  
  console.log(`Initial tokens: ${limiter.tokens}/${limiter.burst}`);
  
  // Fire 6 requests rapidly
  const promises = [];
  for (let i = 0; i < 6; i++) {
    promises.push(
      limiter.schedule(`req-${i}`, async () => {
        console.log(`  ✅ Request ${i} executed at ${new Date().toISOString()}`);
        return `result-${i}`;
      })
    );
  }
  
  await Promise.all(promises);
  const metrics = limiter.getMetrics();
  console.log(`Final metrics: ${metrics.successfulRequests} successful, ${metrics.avgWaitMs}ms avg wait\n`);
}

async function testDeduplication() {
  console.log('🔄 Test 2: Request Deduplication');
  const limiter = new RateLimiter({
    name: 'test-dedupe',
    maxRPS: 10,
    burst: 10
  });
  
  let callCount = 0;
  const task = async () => {
    callCount++;
    console.log(`  🔢 Function called (count: ${callCount})`);
    await new Promise(r => setTimeout(r, 100));
    return `result-${callCount}`;
  };
  
  // Fire 3 identical requests
  const [r1, r2, r3] = await Promise.all([
    limiter.schedule('same-key', task),
    limiter.schedule('same-key', task),
    limiter.schedule('same-key', task)
  ]);
  
  console.log(`  Results: ${r1}, ${r2}, ${r3}`);
  console.log(`  ✅ Deduped ${limiter.getMetrics().dedupedRequests} requests\n`);
}

async function testCaching() {
  console.log('💾 Test 3: Short-TTL Caching');
  const limiter = new RateLimiter({
    name: 'test-cache',
    maxRPS: 10,
    burst: 10
  });
  
  let callCount = 0;
  const task = async () => {
    callCount++;
    console.log(`  📞 API called (count: ${callCount})`);
    return `data-${callCount}`;
  };
  
  // First call
  const r1 = await limiter.schedule('cache-key', task, { ttlMs: 1000 });
  console.log(`  First result: ${r1}`);
  
  // Second call (should use cache)
  const r2 = await limiter.schedule('cache-key', task, { ttlMs: 1000 });
  console.log(`  Second result: ${r2} (from cache)`);
  
  // Wait for cache to expire
  await new Promise(r => setTimeout(r, 1100));
  
  // Third call (cache expired)
  const r3 = await limiter.schedule('cache-key', task, { ttlMs: 1000 });
  console.log(`  Third result: ${r3} (cache expired)`);
  console.log(`  ✅ Cache hits: ${limiter.getMetrics().cacheHits}\n`);
}

async function testBackoff() {
  console.log('⏸️ Test 4: Exponential Backoff');
  const limiter = new RateLimiter({
    name: 'test-backoff',
    maxRPS: 5,
    burst: 5
  });
  
  // Simulate 429 response
  const response = {
    status: 429,
    headers: { get: () => '2' } // Retry after 2 seconds
  };
  
  console.log('  Simulating 429 response...');
  limiter.onHttpResponse(response);
  
  console.log(`  Paused: ${limiter.isPaused}`);
  console.log(`  Pause until: ${new Date(limiter.pauseUntil).toISOString()}`);
  console.log(`  Last 429 at: ${limiter.getMetrics().last429At ? new Date(limiter.getMetrics().last429At).toISOString() : 'N/A'}\n`);
}

async function testConcurrency() {
  console.log('🔀 Test 5: Concurrency Limiting');
  const limiter = new RateLimiter({
    name: 'test-concurrent',
    maxRPS: 10,
    burst: 10,
    maxConcurrent: 2
  });
  
  let concurrent = 0;
  let maxConcurrent = 0;
  
  const task = async (id) => {
    concurrent++;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    console.log(`  🏃 Task ${id} started (concurrent: ${concurrent})`);
    await new Promise(r => setTimeout(r, 200));
    concurrent--;
    console.log(`  ✅ Task ${id} finished`);
    return `done-${id}`;
  };
  
  // Fire 5 tasks
  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(limiter.schedule(`task-${i}`, () => task(i)));
  }
  
  await Promise.all(promises);
  console.log(`  Max concurrent: ${maxConcurrent} (limit was ${limiter.maxConcurrent})\n`);
}

// Run all tests
async function runTests() {
  try {
    await testTokenBucket();
    await testDeduplication();
    await testCaching();
    await testBackoff();
    await testConcurrency();
    
    console.log('✅ All rate limiter tests completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

runTests();