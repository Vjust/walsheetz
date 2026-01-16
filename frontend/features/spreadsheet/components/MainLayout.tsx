import React, { useState, useEffect } from 'react';
import { Header } from './Header';
import { Spreadsheet } from './Spreadsheet';
import { StatusBar } from './StatusBar';
import { NotificationContainer } from './NotificationContainer';
import { LoadingOverlay } from './LoadingOverlay';
import { useSpreadsheetContext } from './SpreadsheetProvider';
import { configLoader } from '@dreamlit/walrus';

export function MainLayout() {
  const {
    saveStatus,
    loadingState,
    editCount,
    walletConnected,
    walletAddress,
    walletBalance,
    walletNetwork,
  } = useSpreadsheetContext();

  return (
    <div className="main-layout">
      <div className="ice-background-particles"></div>

      <Header />

      <div className="spreadsheet-container crystal-shine">
        <Spreadsheet />
      </div>

      <StatusBar
        saveStatus={saveStatus}
        editCount={editCount}
        walletConnected={walletConnected}
        walletAddress={walletAddress}
        walletBalance={walletBalance}
        walletNetwork={walletNetwork}
      />

      <NotificationContainer />

      <LoadingOverlay
        isVisible={loadingState?.isLoading || false}
        message={loadingState?.message || 'Loading...'}
        details={loadingState?.details || ''}
        error={loadingState?.error}
        errorType={loadingState?.errorType}
        type={loadingState?.type}
        steps={loadingState?.steps}
        currentStep={loadingState?.currentStep}
        showProgress={loadingState?.showProgress}
      />
    </div>
  );
}
