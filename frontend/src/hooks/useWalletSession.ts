"use client";

import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";
import { useStellarWallet } from "@/providers/StellarWalletProvider";
import type { EvmTransactionPayload, StellarTransactionPayload } from "@/server/types";

type SignResult = { hash: string } | { error: string };

/**
 * Dispatches signing to the correct wallet depending on payload chainFamily.
 */
export function useWalletSession() {
  const evm = useAccount();
  const stellar = useStellarWallet();
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();

  const family = stellar.isConnected ? "stellar" : evm.isConnected ? "evm" : null;

  /**
   * Sign an EVM transaction payload using the connected EVM wallet (via wagmi).
   * Returns the tx hash on success or an error descriptor.
   */
  async function signEvm(payload: EvmTransactionPayload): Promise<SignResult> {
    try {
      // Switch to the correct chain if needed (only when wallet is connected)
      if (evm.isConnected && evm.chainId !== payload.chainId && switchChainAsync) {
        await switchChainAsync({ chainId: payload.chainId });
      }

      const hash = await sendTransactionAsync(payload.txRequest);
      return { hash };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "EVM wallet rejected the transaction.";
      // Detect common user rejection patterns
      if (
        message.includes("rejected") ||
        message.includes("declined") ||
        message.includes("cancelled") ||
        message.includes("denied") ||
        message.includes("user rejected")
      ) {
        return { error: "user_rejected" };
      }
      return { error: message };
    }
  }

  /**
   * Sign a Stellar transaction XDR using the connected Stellar wallet.
   * Returns the signed XDR on success or an error descriptor.
   */
  async function signStellar(payload: StellarTransactionPayload): Promise<{ signedXdr: string } | { error: string }> {
    try {
      const signedXdr = await stellar.signTransaction(payload.transactionXdr);
      return { signedXdr };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Stellar wallet rejected the signing request.";
      if (
        message.includes("rejected") ||
        message.includes("declined") ||
        message.includes("cancelled") ||
        message.includes("denied") ||
        message.includes("user rejected")
      ) {
        return { error: "user_rejected" };
      }
      return { error: message };
    }
  }

  /**
   * Unified signer: dispatch to EVM or Stellar based on the payload type.
   */
  async function signTransaction(
    payload: EvmTransactionPayload | StellarTransactionPayload,
  ): Promise<{ hash: string } | { signedXdr: string } | { error: string }> {
    if (payload.chainFamily === "evm") {
      return signEvm(payload);
    }
    return signStellar(payload);
  }

  return {
    family,
    address: family === "stellar" ? stellar.address : evm.address,
    chain: family === "stellar" ? stellar.network : evm.chain?.name,
    chainId: family === "evm" ? evm.chainId : undefined,
    isConnected: family !== null,
    isConnecting: stellar.isConnecting || evm.status === "connecting" || evm.status === "reconnecting",
    status: family
      ? "connected"
      : stellar.isConnecting || evm.status === "connecting" || evm.status === "reconnecting"
        ? "connecting"
        : "disconnected",
    /** Send an EVM tx or sign a Stellar XDR through the connected wallet. */
    signTransaction,
    stellar,
    evm,
  } as const;
}
