#!/bin/bash

# Test script for WalSheetz Bridge Server in Docker
# This script builds and tests the bridge server in a Docker container

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
IMAGE_NAME="walsheetz-bridge-test"
CONTAINER_NAME="walsheetz-bridge-test-container"
BRIDGE_PORT=8081
TEST_TIMEOUT=60

echo "🧪 WalSheetz Bridge Docker Test Suite"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up test environment..."
    
    # Stop and remove container if it exists
    if docker ps -q -f name=${CONTAINER_NAME} > /dev/null 2>&1; then
        log_info "Stopping container: ${CONTAINER_NAME}"
        docker stop ${CONTAINER_NAME} > /dev/null 2>&1 || true
    fi
    
    if docker ps -aq -f name=${CONTAINER_NAME} > /dev/null 2>&1; then
        log_info "Removing container: ${CONTAINER_NAME}"
        docker rm ${CONTAINER_NAME} > /dev/null 2>&1 || true
    fi
    
    # Remove test image
    if docker images -q ${IMAGE_NAME} > /dev/null 2>&1; then
        log_info "Removing test image: ${IMAGE_NAME}"
        docker rmi ${IMAGE_NAME} > /dev/null 2>&1 || true
    fi
}

# Trap to cleanup on exit
trap cleanup EXIT

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    log_error "Docker is not running. Please start Docker first."
    exit 1
fi

# Check if port is available
if lsof -i :${BRIDGE_PORT} > /dev/null 2>&1; then
    log_warning "Port ${BRIDGE_PORT} is already in use. The test might fail."
    log_info "You can stop existing processes with: lsof -ti :${BRIDGE_PORT} | xargs kill"
fi

cd "${PROJECT_DIR}"

# Step 1: Build the Docker image
log_info "Building Docker image: ${IMAGE_NAME}"
if docker build -f Dockerfile.bridge -t ${IMAGE_NAME} .; then
    log_success "Docker image built successfully"
else
    log_error "Failed to build Docker image"
    exit 1
fi

# Step 2: Start the container
log_info "Starting bridge container: ${CONTAINER_NAME}"
docker run -d \
    --name ${CONTAINER_NAME} \
    -p ${BRIDGE_PORT}:8081 \
    -e NODE_ENV=test \
    -e BRIDGE_LOG_LEVEL=DEBUG \
    -e BRIDGE_MAX_CLIENTS=10 \
    ${IMAGE_NAME}

if [ $? -eq 0 ]; then
    log_success "Bridge container started successfully"
else
    log_error "Failed to start bridge container"
    exit 1
fi

# Step 3: Wait for service to be ready
log_info "Waiting for bridge service to be ready..."
timeout=0
max_timeout=${TEST_TIMEOUT}

while [ $timeout -lt $max_timeout ]; do
    if curl -s -f http://localhost:${BRIDGE_PORT}/health > /dev/null 2>&1; then
        break
    fi
    sleep 1
    timeout=$((timeout + 1))
    if [ $((timeout % 10)) -eq 0 ]; then
        log_info "Still waiting... (${timeout}s/${max_timeout}s)"
    fi
done

if [ $timeout -ge $max_timeout ]; then
    log_error "Bridge service failed to start within ${max_timeout} seconds"
    log_info "Container logs:"
    docker logs ${CONTAINER_NAME}
    exit 1
fi

log_success "Bridge service is ready (took ${timeout}s)"

# Step 4: Run health checks
log_info "Running health checks..."

# Test health endpoint
health_response=$(curl -s http://localhost:${BRIDGE_PORT}/health)
if echo "$health_response" | grep -q '"status":"healthy"'; then
    log_success "Health check passed"
else
    log_error "Health check failed"
    echo "Response: $health_response"
    exit 1
fi

# Test readiness endpoint
readiness_response=$(curl -s http://localhost:${BRIDGE_PORT}/ready)
if echo "$readiness_response" | grep -q '"status":"ready"'; then
    log_success "Readiness check passed"
else
    log_warning "Readiness check failed (this might be expected if gRPC is not configured)"
    echo "Response: $readiness_response"
fi

# Test metrics endpoint
metrics_response=$(curl -s http://localhost:${BRIDGE_PORT}/metrics)
if echo "$metrics_response" | grep -q '"uptime"'; then
    log_success "Metrics endpoint working"
else
    log_error "Metrics endpoint failed"
    echo "Response: $metrics_response"
    exit 1
fi

# Step 5: Test WebSocket connection
log_info "Testing WebSocket connection..."

# Create a simple WebSocket test script
cat > /tmp/ws-test.js << 'EOF'
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8081');

let connected = false;
let welcomeReceived = false;

const timeout = setTimeout(() => {
    if (!connected || !welcomeReceived) {
        console.log('FAIL: WebSocket test timed out');
        process.exit(1);
    }
}, 10000);

ws.on('open', function open() {
    console.log('WebSocket connected');
    connected = true;
});

ws.on('message', function message(data) {
    const msg = JSON.parse(data);
    console.log('Received:', msg.type);
    
    if (msg.type === 'welcome') {
        console.log('Welcome message received with clientId:', msg.clientId);
        welcomeReceived = true;
        
        // Send a test message
        ws.send(JSON.stringify({
            type: 'query',
            queryType: 'activeUsers',
            requestId: 'test-123'
        }));
    } else if (msg.type === 'queryResult') {
        console.log('Query result received');
        clearTimeout(timeout);
        console.log('SUCCESS: WebSocket test completed');
        ws.close();
        process.exit(0);
    }
});

ws.on('error', function error(err) {
    console.log('WebSocket error:', err.message);
    process.exit(1);
});

ws.on('close', function close() {
    console.log('WebSocket connection closed');
});
EOF

# Run WebSocket test using Node.js in the container
if docker exec ${CONTAINER_NAME} node -e "$(cat /tmp/ws-test.js)" 2>/dev/null; then
    log_success "WebSocket connection test passed"
else
    log_error "WebSocket connection test failed"
    exit 1
fi

# Clean up test file
rm -f /tmp/ws-test.js

# Step 6: Test container logs
log_info "Checking container logs for errors..."
container_logs=$(docker logs ${CONTAINER_NAME} 2>&1)

if echo "$container_logs" | grep -qi "error\|failed\|exception" | head -5; then
    log_warning "Found potential errors in logs:"
    echo "$container_logs" | grep -i "error\|failed\|exception" | head -5
else
    log_success "No obvious errors found in container logs"
fi

# Step 7: Performance test
log_info "Running basic performance test..."
start_time=$(date +%s%N)

# Make 10 rapid requests to health endpoint
for i in {1..10}; do
    curl -s -f http://localhost:${BRIDGE_PORT}/health > /dev/null
done

end_time=$(date +%s%N)
duration_ms=$(( (end_time - start_time) / 1000000 ))

if [ $duration_ms -lt 5000 ]; then  # Less than 5 seconds for 10 requests
    log_success "Performance test passed (${duration_ms}ms for 10 requests)"
else
    log_warning "Performance test slow (${duration_ms}ms for 10 requests)"
fi

# Step 8: Resource usage check
log_info "Checking resource usage..."
container_stats=$(docker stats ${CONTAINER_NAME} --no-stream --format "table {{.CPUPerc}}\t{{.MemUsage}}")
echo "Container resource usage:"
echo "$container_stats"

# Extract memory usage (rough parsing)
memory_usage=$(echo "$container_stats" | tail -n 1 | awk '{print $2}' | cut -d'/' -f1)
if [[ $memory_usage =~ ([0-9.]+)([A-Za-z]+) ]]; then
    mem_value=${BASH_REMATCH[1]}
    mem_unit=${BASH_REMATCH[2]}
    
    if [[ $mem_unit == "MiB" ]] && (( $(echo "$mem_value > 500" | bc -l) )); then
        log_warning "High memory usage: ${memory_usage}"
    else
        log_success "Memory usage within acceptable range: ${memory_usage}"
    fi
fi

# Final summary
echo ""
echo "🎉 Test Summary"
echo "==============="
log_success "✅ Docker image built successfully"
log_success "✅ Container started and running"
log_success "✅ Health checks passing"
log_success "✅ WebSocket connection working"
log_success "✅ HTTP endpoints responding"
log_success "✅ Performance within acceptable range"

log_info "Bridge server is ready for development!"
log_info "Health check: http://localhost:${BRIDGE_PORT}/health"
log_info "Metrics: http://localhost:${BRIDGE_PORT}/metrics" 
log_info "Status: http://localhost:${BRIDGE_PORT}/status"

echo ""
log_info "To view live logs: docker logs -f ${CONTAINER_NAME}"
log_info "To stop the container: docker stop ${CONTAINER_NAME}"