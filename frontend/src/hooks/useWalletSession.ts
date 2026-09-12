"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSignMessage } from "wagmi";
import { useWalletSessionContext } from "@/providers/WalletSessionProvider";

type Family = "evm" | "stellar";

export type ClientSessionLifecycleState =
  | "idle"
  | "authenticating"
  | "authenticated"
  | "superseded"
  | "revoked"
  | "expired"
  | "error";

export interface ClientSessionInfo {
  sessionId?: string;
  generation?: number;
  deviceHint?: string;
  expiresAt?: string;
}

type ChallengePayload = {
  nonce: string;
  family: Family;
  walletAddress: string;
  issuedAt: string;
  expiresAt: string;
  network: string | null;
  challenge?: string;
  challengeXdr?: string;
};

export function useWalletSession() {
  const session = useWalletSessionContext();
  const signMessageAsync = useSignMessage().signMessageAsync;
  const address = session.isConnected ? session.address : undefined;
  const family = session.isConnected ? session.family : null;
  const network =
    family === "stellar"
      ? session.stellar.network === "stellar-pubnet"
        ? "Public Global Stellar Network ; September 2015"
        : "Test SDF Network ; September 2015"
      : session.chainId?.toString() ?? "";

  const [lifecycleState, setLifecycleState] = useState<ClientSessionLifecycleState>("idle");
  const [sessionInfo, setSessionInfo] = useState<ClientSessionInfo | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const queueStream = useRef<Promise<unknown>>(Promise.resolve());
  const inflightFor = useRef<string | null>(null);
  const lastSynced = useRef<string | null>(null);

  const handleSessionError = useCallback((code?: string, detail?: string) => {
    setSessionError(detail ?? code ?? "unknown_error");
    if (code === "session_revoked") {
      setLifecycleState("revoked");
    } else if (code === "session_superseded") {
      setLifecycleState("superseded");
    } else if (code === "session_expired") {
      setLifecycleState("expired");
    } else if (code === "device_binding_mismatch") {
      setLifecycleState("error");
    } else {
      setLifecycleState("error");
    }
  }, []);

  const rotate = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/wallet-session/rotate", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        handleSessionError(errorData.code ?? errorData.error, errorData.message ?? errorData.detail);
        return false;
      }

      const data = await response.json();
      setSessionInfo((prev) => ({
        ...prev,
        sessionId: data.sessionId,
        generation: data.generation,
        expiresAt: data.expiresAt,
      }));
      setLifecycleState("authenticated");
      setSessionError(null);
      return true;
    } catch (err: unknown) {
      handleSessionError("network_error", err instanceof Error ? err.message : String(err));
      return false;
    }
  }, [handleSessionError]);

  const revoke = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/wallet-session", {
        method: "DELETE",
        credentials: "include",
      });

      setSessionInfo(null);
      setLifecycleState("revoked");
      lastSynced.current = null;
      return response.ok;
    } catch {
      setLifecycleState("revoked");
      return false;
    }
  }, []);

  const reconnect = useCallback(async () => {
    lastSynced.current = null;
    inflightFor.current = null;
    setLifecycleState("authenticating");
    setSessionError(null);
  }, []);

  useEffect(() => {
    if (!address || !family) {
      lastSynced.current = null;
      inflightFor.current = null;
      setLifecycleState("idle");
      setSessionInfo(null);
      return;
    }
    if (lastSynced.current === address) return;
    if (inflightFor.current === address) return;
    inflightFor.current = address;
    setLifecycleState("authenticating");
    const queued = queueStream.current;
    const claimedAtStart = address;

    const next = queued
      .then(async () => {
        if (lastSynced.current && lastSynced.current !== claimedAtStart) {
          await fetch("/api/wallet-session", { method: "DELETE", credentials: "include" }).catch(
            () => undefined,
          );
        }
        const claimResult = await runChallenge(
          claimedAtStart,
          family,
          network,
          signMessageAsync,
          session.stellar.signTransaction,
        );
        lastSynced.current = claimedAtStart;
        setSessionInfo({
          sessionId: claimResult.sessionId,
          generation: claimResult.generation,
          deviceHint: claimResult.deviceHint,
          expiresAt: claimResult.expiresAt,
        });
        setLifecycleState("authenticated");
        setSessionError(null);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setSessionError(message);
        if (message.includes("session_revoked")) {
          setLifecycleState("revoked");
        } else if (message.includes("session_superseded")) {
          setLifecycleState("superseded");
        } else if (message.includes("session_expired")) {
          setLifecycleState("expired");
        } else {
          setLifecycleState("error");
        }
        if (process.env.NODE_ENV !== "production") {
          console.warn("wallet session challenge failed", err);
        }
      })
      .finally(() => {
        if (inflightFor.current === claimedAtStart) inflightFor.current = null;
      });

    queueStream.current = next.catch(() => undefined);
  }, [address, family, network, session.stellar.signTransaction, signMessageAsync]);

  return {
    ...session,
    lifecycleState,
    sessionInfo,
    sessionError,
    rotate,
    revoke,
    reconnect,
    handleSessionError,
    walletCapabilities: session.family === "stellar" ? session.stellar.capabilities : null,
    networkStatus: session.family === "stellar" ? session.stellar.networkStatus : null,
    sessionNotice: session.family === "stellar" ? session.stellar.sessionNotice : null,
  } as const;
}

async function runChallenge(
  walletAddress: string,
  family: Family,
  network: string,
  signMessageAsync: (input: { message: string }) => Promise<string>,
  stellarSignTransaction: (xdr: string) => Promise<string>,
) {
  const nonceResponse = await fetch("/api/wallet-session/nonce", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, family, network: network || undefined }),
  });
  if (!nonceResponse.ok) {
    throw new Error(`challenge_issue_failed:${nonceResponse.status}`);
  }
  const challenge = (await nonceResponse.json()) as ChallengePayload;

  let signature: string | undefined;
  let signedTxXdr: string | undefined;

  if (family === "evm") {
    if (!challenge.challenge) throw new Error("evm_challenge_missing");
    signature = await signMessageAsync({ message: challenge.challenge });
  } else {
    if (!challenge.challengeXdr) throw new Error("stellar_challenge_missing");
    signedTxXdr = await stellarSignTransaction(challenge.challengeXdr);
  }

  const claimResponse = await fetch("/api/wallet-session", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      walletAddress,
      family,
      nonce: challenge.nonce,
      signature,
      signedTxXdr,
      network: network || undefined,
    }),
  });
  if (!claimResponse.ok) {
    const detail = await claimResponse.text().catch(() => "");
    throw new Error(`claim_rejected:${claimResponse.status}:${detail}`);
  }

  const claimData = (await claimResponse.json().catch(() => ({}))) as {
    sessionId?: string;
    generation?: number;
    deviceHint?: string;
    expiresAt?: string;
  };

  return claimData;
}
