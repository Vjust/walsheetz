# API Integration Guide

This guide demonstrates how to integrate external APIs with the `walrus-wallet` CLI and SDK to create powerful blockchain automation workflows.

## Table of Contents

- [Overview](#overview)
- [Integration Patterns](#integration-patterns)
- [Authentication](#authentication)
- [SDK + API Usage](#sdk--api-usage)
- [Real-World Examples](#real-world-examples)
- [Best Practices](#best-practices)

## Overview

The `@walrus/subwallet-sdk` can be combined with external APIs to:

- Automate blockchain operations triggered by API events
- Store blockchain data in external services
- Integrate with decentralized storage (Walrus, IPFS, Arweave)
- Build monitoring and alerting systems
- Create custom deployment workflows

### Why Combine SDK + APIs?

**SDK provides:**
- Multi-wallet management
- Sponsored transactions
- Balance checking and fund sweeping
- On-chain Move contract integration

**APIs enable:**
- External data sources
- Third-party service integration
- Custom business logic
- Webhooks and notifications

## Integration Patterns

### 1. REST API Integration

```typescript
import { SubWalletOrchestrator } from '@walrus/subwallet-sdk'
import { NodeFsStorageAdapter } from '@walrus/subwallet-sdk'

class CustomApiClient {
  constructor(private apiKey: string, private baseUrl: string) {}

  async deployData(data: any): Promise<string> {
    const response = await fetch(`${this.baseUrl}/deploy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    const result = await response.json()
    return result.deploymentId
  }

  async getStatus(deploymentId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/status/${deploymentId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    })

    return response.json()
  }
}

// Usage with SDK
const storage = new NodeFsStorageAdapter('./wallets')
const orchestrator = new SubWalletOrchestrator({
  rpcUrl: 'https://fullnode.testnet.sui.io:443',
  storage,
})

const apiClient = new CustomApiClient('api-key', 'https://api.example.com')

// Deploy using API and fund wallets
const deploymentId = await apiClient.deployData({ content: 'hello' })
await orchestrator.createWallets(5)
await orchestrator.fundWallets(sponsor, { amountPerWalletSui: 1.0 })

// Check status
const status = await apiClient.getStatus(deploymentId)
console.log(`Deployment status: ${status.state}`)
```

### 2. GraphQL Integration

```typescript
import { GraphQLClient, gql } from 'graphql-request'

class GraphQLApiClient {
  private client: GraphQLClient

  constructor(endpoint: string, apiKey: string) {
    this.client = new GraphQLClient(endpoint, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    })
  }

  async queryDeployments(walletAddress: string) {
    const query = gql`
      query GetDeployments($address: String!) {
        deployments(where: { walletAddress: $address }) {
          id
          status
          timestamp
          txHash
        }
      }
    `

    return this.client.request(query, { address: walletAddress })
  }

  async createDeployment(input: any) {
    const mutation = gql`
      mutation CreateDeployment($input: DeploymentInput!) {
        createDeployment(input: $input) {
          id
          status
        }
      }
    `

    return this.client.request(mutation, { input })
  }
}

// Use with SDK
const apiClient = new GraphQLApiClient('https://api.example.com/graphql', 'key')
const wallets = await orchestrator.loadWallets()

for (const wallet of wallets) {
  const deployments = await apiClient.queryDeployments(wallet.address)
  console.log(`Wallet ${wallet.id} has ${deployments.length} deployments`)
}
```

### 3. WebSocket Connections

```typescript
import WebSocket from 'ws'

class RealtimeApiClient {
  private ws: WebSocket

  constructor(wsUrl: string) {
    this.ws = new WebSocket(wsUrl)
    this.setupListeners()
  }

  private setupListeners() {
    this.ws.on('message', async (data) => {
      const event = JSON.parse(data.toString())

      if (event.type === 'FUND_WALLETS') {
        // Trigger wallet funding based on WebSocket event
        await this.handleFundingEvent(event)
      }
    })
  }

  private async handleFundingEvent(event: any) {
    const orchestrator = this.getOrchestrator()
    await orchestrator.fundWallets(sponsor, {
      amountPerWalletSui: event.amount,
    })
  }
}
```

## Authentication

### API Key Management

**Store API keys securely:**

```typescript
// Option 1: Environment variables
const apiKey = process.env.MY_API_KEY

// Option 2: CLI config (for plugin development)
import { configManager } from '@walrus/subwallet-sdk/cli'

configManager.set('myApiKey', 'your-key-here')
const apiKey = configManager.get('myApiKey')

// Option 3: Secure key storage (keytar)
import keytar from 'keytar'

await keytar.setPassword('walrus-wallet', 'myApiKey', 'your-key-here')
const apiKey = await keytar.getPassword('walrus-wallet', 'myApiKey')
```

### OAuth Flows

```typescript
class OAuthApiClient {
  private accessToken?: string

  async authenticate(clientId: string, clientSecret: string) {
    const response = await fetch('https://api.example.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    const data = await response.json()
    this.accessToken = data.access_token
  }

  async makeAuthenticatedRequest(endpoint: string) {
    if (!this.accessToken) {
      throw new Error('Not authenticated')
    }

    return fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
    })
  }
}
```

## SDK + API Usage

### Example: Automated Deployment Workflow

```typescript
import { SubWalletOrchestrator } from '@walrus/subwallet-sdk'
import { NodeFsStorageAdapter } from '@walrus/subwallet-sdk'

interface DeploymentConfig {
  content: string
  walletCount: number
  fundingAmount: number
}

class DeploymentWorkflow {
  constructor(
    private orchestrator: SubWalletOrchestrator,
    private apiClient: CustomApiClient
  ) {}

  async deploy(config: DeploymentConfig) {
    // 1. Create wallets if needed
    const existingWallets = await this.orchestrator.loadWallets()

    if (existingWallets.length < config.walletCount) {
      const needed = config.walletCount - existingWallets.length
      await this.orchestrator.createWallets(needed)
    }

    // 2. Fund wallets
    await this.orchestrator.fundWallets(sponsor, {
      amountPerWalletSui: config.fundingAmount,
    })

    // 3. Deploy via API
    const deploymentId = await this.apiClient.deployData({
      content: config.content,
      walletAddresses: existingWallets.map((w) => w.address),
    })

    // 4. Wait for deployment
    let status = await this.apiClient.getStatus(deploymentId)

    while (status.state === 'pending') {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      status = await this.apiClient.getStatus(deploymentId)
    }

    // 5. Cleanup: sweep funds back
    if (status.state === 'completed') {
      await this.orchestrator.sweepToSponsor({ sponsor })
    }

    return status
  }
}

// Usage
const storage = new NodeFsStorageAdapter('./wallets')
const orchestrator = new SubWalletOrchestrator({
  rpcUrl: 'https://fullnode.testnet.sui.io:443',
  storage,
})

const apiClient = new CustomApiClient('api-key', 'https://api.example.com')
const workflow = new DeploymentWorkflow(orchestrator, apiClient)

const result = await workflow.deploy({
  content: 'My content',
  walletCount: 10,
  fundingAmount: 1.0,
})

console.log('Deployment result:', result)
```

## Real-World Examples

### 1. Walrus Storage Integration

```typescript
class WalrusStorageClient {
  constructor(private publisherUrl: string, private aggregatorUrl: string) {}

  async store(data: Buffer): Promise<string> {
    // Store blob in Walrus
    const response = await fetch(`${this.publisherUrl}/v1/store`, {
      method: 'PUT',
      body: data,
    })

    const result = await response.json()
    return result.newlyCreated.blobObject.blobId
  }

  async read(blobId: string): Promise<Buffer> {
    const response = await fetch(`${this.aggregatorUrl}/v1/${blobId}`)
    return Buffer.from(await response.arrayBuffer())
  }
}

// Combine with SDK
const walrusClient = new WalrusStorageClient(
  'https://publisher.walrus-testnet.walrus.space',
  'https://aggregator.walrus-testnet.walrus.space'
)

// Create wallets and fund them
await orchestrator.createWallets(5)
await orchestrator.fundWallets(sponsor, { amountPerWalletSui: 1.0 })

// Store data in Walrus
const blobId = await walrusClient.store(Buffer.from('Hello Walrus!'))
console.log(`Stored blob: ${blobId}`)

// Read back
const data = await walrusClient.read(blobId)
console.log(`Retrieved: ${data.toString()}`)
```

### 2. Custom Blockchain Indexer

```typescript
class BlockchainIndexer {
  constructor(private indexerUrl: string) {}

  async indexWalletActivity(addresses: string[]) {
    const response = await fetch(`${this.indexerUrl}/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses }),
    })

    return response.json()
  }

  async getActivity(address: string) {
    const response = await fetch(`${this.indexerUrl}/activity/${address}`)
    return response.json()
  }
}

// Use with SDK
const indexer = new BlockchainIndexer('https://indexer.example.com')
const wallets = await orchestrator.loadWallets()
const addresses = wallets.map((w) => w.address)

// Index wallet activity
await indexer.indexWalletActivity(addresses)

// Query activity for each wallet
for (const wallet of wallets) {
  const activity = await indexer.getActivity(wallet.address)
  console.log(`Wallet ${wallet.id}: ${activity.transactionCount} transactions`)
}
```

### 3. Transaction Monitoring Service

```typescript
class TransactionMonitor {
  constructor(
    private orchestrator: SubWalletOrchestrator,
    private webhookUrl: string
  ) {}

  async monitorBalances(threshold: number) {
    const balances = await this.orchestrator.checkAllBalances()

    for (const balance of balances) {
      const suiAmount = parseFloat(this.orchestrator.formatSui(balance.suiBalance))

      if (suiAmount < threshold) {
        // Trigger webhook alert
        await this.sendAlert({
          type: 'LOW_BALANCE',
          address: balance.address,
          currentBalance: suiAmount,
          threshold,
        })
      }
    }
  }

  private async sendAlert(alert: any) {
    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert),
    })
  }
}

// Run monitoring periodically
const monitor = new TransactionMonitor(orchestrator, 'https://hooks.example.com/alerts')

setInterval(async () => {
  await monitor.monitorBalances(0.1)  // Alert if below 0.1 SUI
}, 60000)  // Check every minute
```

## Best Practices

### 1. Error Handling

```typescript
async function safeApiCall<T>(
  apiCall: () => Promise<T>,
  retries = 3
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await apiCall()
    } catch (error) {
      if (i === retries - 1) throw error
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)))
    }
  }
  throw new Error('Max retries exceeded')
}

// Usage
const result = await safeApiCall(() => apiClient.deployData(data))
```

### 2. Rate Limiting

```typescript
import pLimit from 'p-limit'

const limit = pLimit(5)  // Max 5 concurrent requests

const wallets = await orchestrator.loadWallets()
const promises = wallets.map((wallet) =>
  limit(() => apiClient.processWallet(wallet.address))
)

await Promise.all(promises)
```

### 3. Caching

```typescript
class CachedApiClient {
  private cache = new Map<string, { data: any; timestamp: number }>()
  private cacheTTL = 60000  // 1 minute

  async get(key: string): Promise<any> {
    const cached = this.cache.get(key)

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data
    }

    const data = await this.fetchFromApi(key)
    this.cache.set(key, { data, timestamp: Date.now() })
    return data
  }

  private async fetchFromApi(key: string): Promise<any> {
    // Actual API call
  }
}
```

### 4. Logging and Debugging

```typescript
class LoggingApiClient {
  async makeRequest(endpoint: string, options: any) {
    console.log(`[API] ${options.method || 'GET'} ${endpoint}`)

    const start = Date.now()

    try {
      const response = await fetch(endpoint, options)
      const duration = Date.now() - start

      console.log(`[API] Response ${response.status} in ${duration}ms`)

      return response
    } catch (error) {
      console.error(`[API] Error:`, error)
      throw error
    }
  }
}
```

## Resources

- [Plugin Development Guide](./PLUGIN_DEVELOPMENT.md)
- [CLI Usage Guide](./CLI.md)
- [Walrus Documentation](https://docs.walrus.site)
- [Sui Documentation](https://docs.sui.io)

## Next Steps

1. Review the [example plugin](../examples/plugin-custom-api) for a complete working implementation
2. Create your own CLI plugin for your specific API
3. Share your plugin with the community!
