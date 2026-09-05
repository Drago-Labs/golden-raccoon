"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, Laptop, Orbit, RefreshCw, Smartphone, Wallet, X } from "lucide-react";
import { useWalletSession } from "@/hooks/useWalletSession";
import { shortenWalletAddress } from "@/lib/wallet/session";

const ConnectButtonCustom = dynamic(
  () => import("@rainbow-me/rainbowkit").then((m) => m.ConnectButton.Custom),
  { ssr: false, loading: () => null }
);

const NetworkMismatchNotice = dynamic(
  () => import("@/components/NetworkMismatchNotice").then((m) => m.NetworkMismatchNotice),
  { ssr: false, loading: () => null }
);

const WalletBadge = dynamic(
  () => import("@/components/WalletBadge").then((m) => m.WalletBadge),
  { ssr: false, loading: () => null }
);

export function WalletConnectButton() {
  const session = useWalletSession();
  const stellar = session.stellar;
  const [isOpen, setIsOpen] = useState(false);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const hasSession = session.isConnected || session.isRestored;

  useEffect(() => {
    if (!isOpen) return;
    firstActionRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  const buttonLabel = hasSession
    ? shortenWalletAddress(session.address)
    : session.isConnecting
      ? "Connecting..."
      : "Connect Wallet";

  async function connectStellar(walletId?: string) {
    session.selectFamily("stellar");
    try {
      await stellar.connect(walletId);
      setIsOpen(true);
    } catch {
      setIsOpen(true);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
        onMouseEnter={() => void import("@rainbow-me/rainbowkit")}
        onFocus={() => void import("@rainbow-me/rainbowkit")}
        className={`inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition sm:px-5 ${
          hasSession
            ? "border border-white/10 bg-white/8 text-white hover:bg-white/12"
            : "bg-[#d9a441] text-black hover:bg-[#f2c86d]"
        }`}
      >
        {session.family === "stellar" ? <Orbit className="h-4 w-4 text-[#a99aff]" /> : <Wallet className="h-4 w-4" />}
        <span className="max-w-28 truncate">{buttonLabel}</span>
      </button>

      {isOpen ? (
        <ConnectButtonCustom>
        {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => (
              <div
                role="dialog"
                aria-modal="false"
                aria-label="Wallet session"
                className="fixed inset-x-4 top-24 z-50 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-white/12 bg-[#101010] p-4 shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-14 sm:w-80"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-[0.15em] text-white/45">
                    {hasSession ? "Wallet session" : "Select wallet"}
                  </div>
                  <button
                    ref={firstActionRef}
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close wallet selector"
                    className="rounded-lg p-1 text-white/60 hover:bg-white/8 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {hasSession ? (
                  <div className="space-y-3">
                    <dl className="space-y-2 rounded-xl border border-white/8 bg-black/25 p-3 text-xs">
                      <div className="flex justify-between gap-4">
                        <dt className="text-white/45">Wallet</dt>
                        <dd className="text-right text-white">{session.walletType ?? session.family?.toUpperCase() ?? "Wallet"}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-white/45">Network</dt>
                        <dd className="text-right text-white">{session.chain ?? "Reconnect to verify"}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-white/45">Address</dt>
                        <dd className="font-mono text-right text-white">{shortenWalletAddress(session.address)}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-white/45">Signer</dt>
                        <dd className={session.signerCapability === "ready" ? "text-emerald-300" : session.signerCapability === "blocked" ? "text-red-200" : "text-amber-200"}>
                          {session.signerCapability === "ready" ? "Ready — approval required" : session.signerCapability === "blocked" ? "Blocked by network" : session.isRestored ? "Display only — reconnect" : "Unavailable"}
                        </dd>
                      </div>
                    </dl>

                    {session.family === "stellar" ? (
                      <div className="grid gap-2">
                        <WalletBadge />
                        <NetworkMismatchNotice />
                      </div>
                    ) : null}
                    {stellar.error && session.family === "stellar" ? (
                      <div role="alert" className="rounded-xl border border-red-300/20 bg-red-500/10 p-3 text-xs text-red-100">
                        {stellar.error}
                      </div>
                    ) : null}

                    <div className="grid gap-2">
                      {session.explorerUrl ? (
                        <a href={session.explorerUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-white hover:bg-white/8">
                          Explorer <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                      {session.family === "stellar" && stellar.isRestored ? (
                        <button type="button" onClick={() => void connectStellar(stellar.walletId)} className="flex items-center justify-center gap-2 rounded-xl bg-[#7b61ff] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#8d77ff]">
                          <RefreshCw className="h-4 w-4" /> Reconnect {stellar.walletName}
                        </button>
                      ) : session.family === "stellar" ? (
                        <button type="button" onClick={() => void stellar.openProfile()} className="rounded-xl border border-white/10 px-3 py-2.5 text-sm text-white hover:bg-white/8">
                          Open selected wallet
                        </button>
                      ) : mounted && account && chain?.unsupported ? (
                        <button type="button" onClick={openChainModal} className="rounded-xl bg-red-500 px-3 py-2.5 text-sm font-semibold text-white">
                          Choose supported network
                        </button>
                      ) : (
                        <button type="button" onClick={openAccountModal} className="rounded-xl border border-white/10 px-3 py-2.5 text-sm text-white hover:bg-white/8">
                          Open selected wallet
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 border-t border-white/8 pt-3">
                      <button type="button" onClick={() => { session.selectFamily("evm"); if (!session.connectedFamilies.evm) openConnectModal(); }} className="rounded-xl px-3 py-2 text-xs text-white/70 hover:bg-white/8 hover:text-white">
                        Use EVM
                      </button>
                      <button type="button" onClick={() => { session.selectFamily("stellar"); if (!stellar.displayAddress) void connectStellar(); }} className="rounded-xl px-3 py-2 text-xs text-white/70 hover:bg-white/8 hover:text-white">
                        Use Stellar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => { session.selectFamily("evm"); setIsOpen(false); openConnectModal(); }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-white hover:bg-white/8"
                    >
                      <Wallet className="h-5 w-5 text-[#d9a441]" />
                      <span><span className="block">EVM wallet</span><span className="block text-xs text-white/40">RainbowKit</span></span>
                    </button>
                    <button
                      type="button"
                      disabled={stellar.isConnecting}
                      onClick={() => void connectStellar("freighter")}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-white hover:bg-white/8 disabled:opacity-50"
                    >
                      <Laptop className="h-5 w-5 text-[#a99aff]" />
                      <span><span className="block">{stellar.isConnecting ? "Connecting..." : "Freighter"}</span><span className="block text-xs text-white/40">Desktop extension</span></span>
                    </button>
                    <button
                      type="button"
                      disabled={stellar.isConnecting || !stellar.mobileAvailable}
                      title={stellar.mobileAvailable ? undefined : "Mobile wallet connection is not configured for this deployment."}
                      onClick={() => void connectStellar("wallet_connect")}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-white hover:bg-white/8 disabled:opacity-45"
                    >
                      <Smartphone className="h-5 w-5 text-[#a99aff]" />
                      <span><span className="block">Mobile Stellar wallet</span><span className="block text-xs text-white/40">{stellar.mobileAvailable ? "WalletConnect" : "WalletConnect configuration required"}</span></span>
                    </button>
                    <button
                      type="button"
                      disabled={stellar.isConnecting}
                      onClick={() => void connectStellar()}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-white hover:bg-white/8 disabled:opacity-50"
                    >
                      <Orbit className="h-5 w-5 text-[#a99aff]" />
                      <span><span className="block">All Stellar wallets</span><span className="block text-xs text-white/40">Wallets Kit</span></span>
                    </button>
                    {stellar.error ? <div role="alert" className="mt-2 rounded-xl bg-red-500/10 p-3 text-xs text-red-100">{stellar.error}</div> : null}
                  </div>
                )}
              </div>
        )}
        </ConnectButtonCustom>
      ) : null}
    </div>
  );
}
