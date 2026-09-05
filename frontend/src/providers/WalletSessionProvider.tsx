"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  isWalletFamily,
  SELECTED_WALLET_FAMILY_KEY,
  type WalletFamily,
} from "@/lib/wallet/session";
import dynamic from "next/dynamic";
import type { WalletSessionState } from "@/lib/wallet/build-session";

const WalletStack = dynamic(() => import("@/components/lazy/WalletStack"), {
  loading: () => null,
  ssr: false,
});

const selectedFamilyChangedEvent = "golden-raccoon:selected-family-changed";
const walletConnectRequestedEvent = "golden-raccoon:wallet-connect-requested";

const defaultSession: WalletSessionState = {
  family: null,
  selectedFamily: null,
  selectFamily: () => {},
  address: undefined,
  chain: undefined,
  chainId: undefined,
  walletType: undefined,
  explorerUrl: undefined,
  signerCapability: "unavailable",
  isConnected: false,
  isConnecting: false,
  isRestored: false,
  status: "disconnected",
  connectedFamilies: { evm: false, stellar: false },
  stellar: undefined,
  evm: undefined,
};

const WalletSessionContext = createContext<WalletSessionState>(defaultSession);

function subscribeToSelectedFamily(callback: () => void) {
  window.addEventListener(selectedFamilyChangedEvent, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(selectedFamilyChangedEvent, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSelectedFamilySnapshot() {
  return window.localStorage.getItem(SELECTED_WALLET_FAMILY_KEY);
}

function getServerSelectedFamilySnapshot() {
  return null;
}

export function WalletSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<WalletSessionState>(defaultSession);
  const [walletLoaded, setWalletLoaded] = useState(false);

  const storedFamily = useSyncExternalStore(subscribeToSelectedFamily, getSelectedFamilySnapshot, getServerSelectedFamilySnapshot);
  const selectedFamily = isWalletFamily(storedFamily) ? storedFamily : null;

  const selectFamily = useCallback((family: WalletFamily) => {
    window.localStorage.setItem(SELECTED_WALLET_FAMILY_KEY, family);
    window.dispatchEvent(new Event(selectedFamilyChangedEvent));
    window.dispatchEvent(new Event(walletConnectRequestedEvent));
  }, []);

  useEffect(() => {
    const handleConnectRequest = () => setWalletLoaded(true);
    window.addEventListener(walletConnectRequestedEvent, handleConnectRequest);
    return () => window.removeEventListener(walletConnectRequestedEvent, handleConnectRequest);
  }, []);

  useEffect(() => {
    if (selectedFamily) {
      setWalletLoaded(true);
    }
  }, [selectedFamily]);

  const value = useMemo(() => session, [session]);

  return (
    <WalletSessionContext.Provider value={value}>
      {walletLoaded && (
        <WalletStack
          selectedFamily={selectedFamily}
          selectFamily={selectFamily}
          onSessionChange={setSession}
        />
      )}
      {children}
    </WalletSessionContext.Provider>
  );
}

export function useWalletSessionContext() {
  const context = useContext(WalletSessionContext);
  if (!context) throw new Error("useWalletSession must be used inside WalletSessionProvider.");
  return context;
}