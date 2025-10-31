import React, { useState } from 'react'
import { useSpreadsheetContext } from '../presentation/components/spreadsheet'
import UnicornStudioHero from '../presentation/components/UnicornStudioHero.jsx'
import { logger, LogComponent } from '../utils/Logger.js'

export function UnicornHeroPage() {
  const [connectingWallet, setConnectingWallet] = useState(false)
  const [error, setError] = useState(null)

  const { connectWallet } = useSpreadsheetContext()

  const handleConnectWallet = async () => {
    try {
      setConnectingWallet(true)
      setError(null)
      logger.logUserAction('unicorn_hero_wallet_connect_attempt')

      const result = await connectWallet()

      if (result.success) {
        logger.info(LogComponent.UI_COMPONENT, 'unicorn_hero_wallet_connect_success', 'Wallet connected from Unicorn Hero', {
          walletAddress: result.wallet?.address
        })
      } else {
        setError(result.error || 'Failed to connect wallet')
        logger.error(LogComponent.UI_COMPONENT, 'unicorn_hero_wallet_connect_error', 'Failed to connect wallet from Unicorn Hero', {
          error: result.error
        })
      }
    } catch (error) {
      setError(error.message || 'Error connecting wallet')
      logger.error(LogComponent.UI_COMPONENT, 'unicorn_hero_wallet_connect_exception', 'Exception connecting wallet from Unicorn Hero', {
        error: error.message
      })
    } finally {
      setConnectingWallet(false)
    }
  }

  return (
    <UnicornStudioHero
      onConnectWallet={handleConnectWallet}
      connectingWallet={connectingWallet}
      error={error}
    />
  )
}
