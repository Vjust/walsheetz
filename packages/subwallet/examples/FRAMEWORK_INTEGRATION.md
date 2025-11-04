# Framework Integration Guide

Step-by-step integration examples for Next.js and Vite.

## Next.js Integration

### Next.js 14+ (App Router)

#### 1. Install Dependencies

```bash
npm install @walrus/subwallet-sdk @mysten/sui.js
```

#### 2. Create a Storage Provider (Client Component)

```typescript
// app/providers/wallet-provider.tsx
'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { SubWalletOrchestrator, MemoryStorageAdapter } from '@walrus/subwallet-sdk';
import type { WalletBalance } from '@walrus/subwallet-sdk';

interface WalletContextType {
  orchestrator: SubWalletOrchestrator;
  balances: WalletBalance[];
  loading: boolean;
  refreshBalances: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [orchestrator] = useState(() => {
    const storage = new MemoryStorageAdapter();
    return new SubWalletOrchestrator({
      rpcUrl: process.env.NEXT_PUBLIC_SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443',
      storage,
      concurrency: 4,
      move: process.env.NEXT_PUBLIC_WALRUS_SUBWALLET_PACKAGE
        ? {
            packageId: process.env.NEXT_PUBLIC_WALRUS_SUBWALLET_PACKAGE,
            policyId: process.env.NEXT_PUBLIC_WALRUS_SUBWALLET_POLICY,
          }
        : undefined,
    });
  });

  const [balances, setBalances] = useState<WalletBalance[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshBalances = async () => {
    setLoading(true);
    try {
      const bals = await orchestrator.checkAllBalances();
      setBalances(bals);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshBalances();
  }, []);

  return (
    <WalletContext.Provider value={{ orchestrator, balances, loading, refreshBalances }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used within WalletProvider');
  return context;
}
```

#### 3. Add Provider to Root Layout

```typescript
// app/layout.tsx
import { WalletProvider } from './providers/wallet-provider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
```

#### 4. Use in Components

```typescript
// app/wallets/page.tsx
'use client';

import { useWallet } from '../providers/wallet-provider';

export default function WalletsPage() {
  const { orchestrator, balances, loading, refreshBalances } = useWallet();

  const createWallet = async () => {
    await orchestrator.createWallet();
    await refreshBalances();
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Wallet Dashboard</h1>
      
      <button
        onClick={createWallet}
        disabled={loading}
        className="mb-4 px-4 py-2 bg-blue-500 text-white rounded"
      >
        Create New Wallet
      </button>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="space-y-4">
          {balances.map(balance => (
            <div key={balance.walletId} className="p-4 border rounded">
              <p>Wallet: {balance.walletId}</p>
              <p>SUI: {orchestrator.formatSui(balance.sui)}</p>
              <p>Address: {balance.address}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

#### 5. API Routes (Optional)

```typescript
// app/api/wallets/balance/route.ts
import { NextResponse } from 'next/server';
import { SubWalletOrchestrator, NodeFsStorageAdapter } from '@walrus/subwallet-sdk';

export async function GET() {
  const orchestrator = new SubWalletOrchestrator({
    rpcUrl: process.env.SUI_RPC_URL!,
    storage: new NodeFsStorageAdapter(process.env.WALLETS_DIR!),
  });

  const balances = await orchestrator.checkAllBalances();
  return NextResponse.json(balances);
}
```

### Next.js 13 (Pages Router)

#### 1. Create a Hook

```typescript
// hooks/useWalletOrchestrator.ts
import { useState, useEffect } from 'react';
import { SubWalletOrchestrator, MemoryStorageAdapter } from '@walrus/subwallet-sdk';
import type { WalletBalance } from '@walrus/subwallet-sdk';

export function useWalletOrchestrator() {
  const [orchestrator] = useState(() => {
    const storage = new MemoryStorageAdapter();
    return new SubWalletOrchestrator({
      rpcUrl: process.env.NEXT_PUBLIC_SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443',
      storage,
    });
  });

  const [balances, setBalances] = useState<WalletBalance[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshBalances = async () => {
    setLoading(true);
    try {
      const bals = await orchestrator.checkAllBalances();
      setBalances(bals);
    } finally {
      setLoading(false);
    }
  };

  return { orchestrator, balances, loading, refreshBalances };
}
```

#### 2. Use in Pages

```typescript
// pages/wallets.tsx
import { useWalletOrchestrator } from '../hooks/useWalletOrchestrator';
import { useEffect } from 'react';

export default function WalletsPage() {
  const { orchestrator, balances, loading, refreshBalances } = useWalletOrchestrator();

  useEffect(() => {
    refreshBalances();
  }, []);

  return (
    <div>
      <h1>Wallet Dashboard</h1>
      {/* Your UI here */}
    </div>
  );
}
```

## Vite Integration

### Vite + React

#### 1. Install Dependencies

```bash
npm install @walrus/subwallet-sdk @mysten/sui.js
```

#### 2. Configure Environment Variables

```env
# .env
VITE_SUI_RPC_URL=https://fullnode.testnet.sui.io:443
```

#### 3. Create a Wallet Context

```typescript
// src/contexts/WalletContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { SubWalletOrchestrator, MemoryStorageAdapter } from '@walrus/subwallet-sdk';
import type { WalletBalance } from '@walrus/subwallet-sdk';

interface WalletContextType {
  orchestrator: SubWalletOrchestrator;
  balances: WalletBalance[];
  loading: boolean;
  refreshBalances: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [orchestrator] = useState(() => {
    const storage = new MemoryStorageAdapter();
    return new SubWalletOrchestrator({
      rpcUrl: import.meta.env.VITE_SUI_RPC_URL,
      storage,
      concurrency: 4,
      move: import.meta.env.VITE_WALRUS_SUBWALLET_PACKAGE
        ? {
            packageId: import.meta.env.VITE_WALRUS_SUBWALLET_PACKAGE,
            policyId: import.meta.env.VITE_WALRUS_SUBWALLET_POLICY,
          }
        : undefined,
    });
  });

  const [balances, setBalances] = useState<WalletBalance[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshBalances = async () => {
    setLoading(true);
    try {
      const bals = await orchestrator.checkAllBalances();
      setBalances(bals);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshBalances();
  }, []);

  return (
    <WalletContext.Provider value={{ orchestrator, balances, loading, refreshBalances }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used within WalletProvider');
  return context;
}
```

#### 4. Add Provider to App

```typescript
// src/App.tsx
import { WalletProvider } from './contexts/WalletContext';
import { WalletDashboard } from './components/WalletDashboard';

function App() {
  return (
    <WalletProvider>
      <WalletDashboard />
    </WalletProvider>
  );
}

export default App;
```

#### 5. Use in Components

```typescript
// src/components/WalletDashboard.tsx
import { useWallet } from '../contexts/WalletContext';

export function WalletDashboard() {
  const { orchestrator, balances, loading, refreshBalances } = useWallet();

  const createWallet = async () => {
    await orchestrator.createWallet();
    await refreshBalances();
  };

  return (
    <div>
      <h1>Wallet Dashboard</h1>
      <button onClick={createWallet} disabled={loading}>
        Create Wallet
      </button>
      
      {loading ? (
        <p>Loading...</p>
      ) : (
        <ul>
          {balances.map(b => (
            <li key={b.walletId}>
              {b.walletId}: {orchestrator.formatSui(b.sui)} SUI
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### Vite + Vue

#### 1. Create a Composable

```typescript
// src/composables/useWallet.ts
import { ref, onMounted } from 'vue';
import { SubWalletOrchestrator, MemoryStorageAdapter } from '@walrus/subwallet-sdk';
import type { WalletBalance } from '@walrus/subwallet-sdk';

const orchestrator = new SubWalletOrchestrator({
  rpcUrl: import.meta.env.VITE_SUI_RPC_URL,
  storage: new MemoryStorageAdapter(),
  concurrency: 4,
  move: import.meta.env.VITE_WALRUS_SUBWALLET_PACKAGE
    ? {
        packageId: import.meta.env.VITE_WALRUS_SUBWALLET_PACKAGE,
        policyId: import.meta.env.VITE_WALRUS_SUBWALLET_POLICY,
      }
    : undefined,
});

export function useWallet() {
  const balances = ref<WalletBalance[]>([]);
  const loading = ref(false);

  const refreshBalances = async () => {
    loading.value = true;
    try {
      balances.value = await orchestrator.checkAllBalances();
    } finally {
      loading.value = false;
    }
  };

  const createWallet = async () => {
    await orchestrator.createWallet();
    await refreshBalances();
  };

  onMounted(() => {
    refreshBalances();
  });

  return {
    orchestrator,
    balances,
    loading,
    refreshBalances,
    createWallet,
  };
}
```

#### 2. Use in Components

```vue
<!-- src/components/WalletDashboard.vue -->
<script setup lang="ts">
import { useWallet } from '../composables/useWallet';

const { orchestrator, balances, loading, createWallet } = useWallet();
</script>

<template>
  <div>
    <h1>Wallet Dashboard</h1>
    <button @click="createWallet" :disabled="loading">
      Create Wallet
    </button>

    <div v-if="loading">Loading...</div>
    <ul v-else>
      <li v-for="balance in balances" :key="balance.walletId">
        {{ balance.walletId }}: {{ orchestrator.formatSui(balance.sui) }} SUI
      </li>
    </ul>
  </div>
</template>
```

## Custom Storage for Browser Persistence

### Using localStorage

```typescript
// lib/storage/localStorage.ts
import type { StorageAdapter, WalletMetadata } from '@walrus/subwallet-sdk';
import type { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';

export class LocalStorageAdapter implements StorageAdapter {
  async loadWallets(): Promise<WalletMetadata[]> {
    const data = localStorage.getItem('wallets');
    return data ? JSON.parse(data) : [];
  }

  async saveWallets(wallets: WalletMetadata[]): Promise<void> {
    localStorage.setItem('wallets', JSON.stringify(wallets));
  }

  async loadKeypair(walletId: string): Promise<Ed25519Keypair | null> {
    const key = localStorage.getItem(`wallet_${walletId}`);
    if (!key) return null;
    
    const { Ed25519Keypair } = await import('@mysten/sui.js/keypairs/ed25519');
    const secretKey = new Uint8Array(JSON.parse(key));
    return Ed25519Keypair.fromSecretKey(secretKey);
  }

  async saveKeypair(walletId: string, keypair: Ed25519Keypair): Promise<void> {
    const exported = keypair.export();
    localStorage.setItem(`wallet_${walletId}`, JSON.stringify(Array.from(exported.privateKey)));
  }
}

// Use it:
const orchestrator = new SubWalletOrchestrator({
  rpcUrl: import.meta.env.VITE_SUI_RPC_URL,
  storage: new LocalStorageAdapter(),
});
```

## TypeScript Configuration

### Next.js

Your `tsconfig.json` should have:

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "isolatedModules": true,
    "jsx": "preserve"
  }
}
```

### Vite

Your `tsconfig.json` should have:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "esModuleInterop": true
  }
}
```

## Build Considerations

### Code Splitting

Both Next.js and Vite automatically code-split. The SDK is tree-shakeable, so unused parts won't be included in your bundle.

### Server-Side Rendering (SSR)

When using Next.js with SSR, be careful not to use filesystem adapters in client components:

```typescript
// ✅ Good: Use NodeFsStorageAdapter only in API routes or server components
// app/api/wallets/route.ts
import { NodeFsStorageAdapter } from '@walrus/subwallet-sdk';

// ❌ Bad: Don't use NodeFsStorageAdapter in client components
// app/components/ClientComponent.tsx
'use client';
import { NodeFsStorageAdapter } from '@walrus/subwallet-sdk'; // Will fail!
```

Use `MemoryStorageAdapter` or custom browser storage for client components.

## Testing

### Jest/Vitest

```typescript
// __tests__/wallet.test.ts
import { describe, it, expect } from 'vitest';
import { SubWalletOrchestrator, MemoryStorageAdapter } from '@walrus/subwallet-sdk';

describe('Wallet Integration', () => {
  it('should create wallets', async () => {
    const orch = new SubWalletOrchestrator({
      rpcUrl: 'https://fullnode.testnet.sui.io:443',
      storage: new MemoryStorageAdapter(),
    });

    const wallet = await orch.createWallet();
    expect(wallet.address).toMatch(/^0x/);
  });
});
```

## Troubleshooting

### "Module not found" in Vite

Make sure your `vite.config.ts` doesn't exclude the SDK:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@walrus/subwallet-sdk'],
  },
});
```

### "Cannot use import statement outside a module" in Next.js

Ensure your `next.config.js` transpiles the SDK:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@walrus/subwallet-sdk'],
};

module.exports = nextConfig;
```

### Memory Issues in Browser

If storing many wallets, use IndexedDB instead of localStorage:

```typescript
import { IndexedDBAdapter } from './examples/custom-storage';

const orchestrator = new SubWalletOrchestrator({
  rpcUrl: import.meta.env.VITE_SUI_RPC_URL,
  storage: new IndexedDBAdapter(),
});
```

