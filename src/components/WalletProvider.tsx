'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { StellarWalletsKit, Networks, KitEventType } from '@creit.tech/stellar-wallets-kit';
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull';
import { AlbedoModule } from '@creit.tech/stellar-wallets-kit/modules/albedo';
import { classifyStellarError } from '@/lib/errors';

interface WalletContextType {
  publicKey: string | null;
  walletId: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize the StellarWalletsKit on client-side mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      StellarWalletsKit.init({
        network: Networks.TESTNET,
        modules: [
          new FreighterModule(),
          new AlbedoModule(),
          new xBullModule(),
        ],
      });

      // Subscribe to events
      const unsubscribeState = StellarWalletsKit.on(KitEventType.STATE_UPDATED, (event) => {
        if (event.payload.address) {
          setPublicKey(event.payload.address);
        }
      });

      const unsubscribeWallet = StellarWalletsKit.on(KitEventType.WALLET_SELECTED, (event) => {
        if (event.payload.id) {
          setWalletId(event.payload.id);
          localStorage.setItem('selected_wallet_id', event.payload.id);
        }
      });

      const unsubscribeDisconnect = StellarWalletsKit.on(KitEventType.DISCONNECT, () => {
        setPublicKey(null);
        setWalletId(null);
        localStorage.removeItem('selected_wallet_id');
      });

      // Auto-reconnect flow
      const autoReconnect = async () => {
        const storedWalletId = localStorage.getItem('selected_wallet_id');
        if (storedWalletId) {
          try {
            StellarWalletsKit.setWallet(storedWalletId);
            // Fetch address from wallet
            const { address } = await StellarWalletsKit.fetchAddress();
            if (address) {
              setPublicKey(address);
              setWalletId(storedWalletId);
            }
          } catch (err) {
            console.warn('Auto-reconnect failed:', err);
            // Don't show modal/alert for auto-reconnect failures, just clear storage
            localStorage.removeItem('selected_wallet_id');
          }
        }
        setIsLoading(false);
      };

      autoReconnect();

      return () => {
        unsubscribeState();
        unsubscribeWallet();
        unsubscribeDisconnect();
      };
    } catch (err) {
      console.error('Failed to initialize StellarWalletsKit:', err);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoading(false);
    }
  }, []);

  const connect = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // This opens the kit's built-in modal for selection
      const { address } = await StellarWalletsKit.authModal({
        // Optional params can go here
      });
      if (address) {
        setPublicKey(address);
      }
    } catch (err: unknown) {
      // Sometimes authModal throws/rejects if the modal is closed, even if the connection
      // succeeded through event listeners. Let's verify if the wallet is actually connected.
      try {
        const currentAddress = await StellarWalletsKit.getAddress();
        if (currentAddress?.address) {
          setPublicKey(currentAddress.address);
          setError(null);
          return;
        }
      } catch {
        // Ignored, proceed to report the original connection error
      }

      console.error('Wallet connection error:', err);
      const classified = classifyStellarError(err);
      setError(classified.message);
    } finally {
      setIsLoading(false);
    }
  };

  const disconnect = async () => {
    setIsLoading(true);
    try {
      await StellarWalletsKit.disconnect();
      setPublicKey(null);
      setWalletId(null);
      localStorage.removeItem('selected_wallet_id');
    } catch (err: unknown) {
      console.error('Wallet disconnect error:', err);
      const classified = classifyStellarError(err);
      setError(classified.message);
    } finally {
      setIsLoading(false);
    }
  };

  const clearError = () => setError(null);

  return (
    <WalletContext.Provider
      value={{
        publicKey,
        walletId,
        connect,
        disconnect,
        isLoading,
        error,
        clearError,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
