import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { BlockchainAdapterProvider, useBlockchainAdapter } from '../contexts/BlockchainAdapterContext'

// Mock component that uses the context
function TestComponent() {
  const { adapter, isReady, staleFallbacks, setStaleFallbacks } = useBlockchainAdapter()

  return (
    <div>
      <div data-testid="ready-status">{isReady ? 'Ready' : 'Not Ready'}</div>
      <div data-testid="adapter-status">{adapter ? 'Adapter Present' : 'No Adapter'}</div>
      <div data-testid="stale-count">{staleFallbacks.length}</div>
      <button onClick={() => setStaleFallbacks([{ key: 'test', timestamp: Date.now() }])}>
        Set Fallbacks
      </button>
    </div>
  )
}

describe('BlockchainAdapterContext', () => {
  it('should throw error when hook is used outside provider', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation()

    expect(() => {
      render(<TestComponent />)
    }).toThrow('useBlockchainAdapter must be used within a BlockchainAdapterProvider')

    consoleError.mockRestore()
  })

  it('should provide context values when wrapped with provider', async () => {
    render(
      <BlockchainAdapterProvider>
        <TestComponent />
      </BlockchainAdapterProvider>
    )

    await waitFor(() => {
      const readyStatus = screen.getByTestId('ready-status')
      expect(readyStatus).toBeInTheDocument()
    })
  })

  it('should initialize with isReady false', () => {
    render(
      <BlockchainAdapterProvider>
        <TestComponent />
      </BlockchainAdapterProvider>
    )

    const readyStatus = screen.getByTestId('ready-status')
    expect(readyStatus.textContent).toBe('Not Ready')
  })

  it('should track stale fallbacks', async () => {
    render(
      <BlockchainAdapterProvider>
        <TestComponent />
      </BlockchainAdapterProvider>
    )

    const staleCount = screen.getByTestId('stale-count')
    expect(staleCount.textContent).toBe('0')

    const button = screen.getByRole('button', { name: /set fallbacks/i })
    button.click()

    await waitFor(() => {
      expect(staleCount.textContent).toBe('1')
    })
  })
})
