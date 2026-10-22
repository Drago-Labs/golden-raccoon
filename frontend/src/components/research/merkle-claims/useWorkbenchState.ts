"use client";

import { useRef, useState, type FormEvent } from "react";
import { useWalletSession } from "@/hooks/useWalletSession";
import { LEAF_ENCODINGS, type LeafEncoding, type MerkleClaimsResult } from "@/server/research/merkle-claims";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const SUPPORTED_NETWORKS = ["ethereum", "base", "arbitrum", "polygon", "optimism", "bsc", "avalanche"] as const;

/**
 * Owns all form/request state for the Merkle-claim verifier. Split out of
 * the container component so the fetch/race-condition logic can be
 * exercised without rendering anything.
 */
export function useWorkbenchState() {
  const wallet = useWalletSession();
  const walletAddress = wallet.family === "evm" ? wallet.address : undefined;
  const connected = Boolean(walletAddress && wallet.family === "evm" && wallet.isConnected);

  const [network, setNetwork] = useState<string>(SUPPORTED_NETWORKS[0]);
  const [distributorAddress, setDistributorAddress] = useState("");
  const [claimAddress, setClaimAddress] = useState("");
  const [treeSource, setTreeSource] = useState("");
  const [leafEncoding, setLeafEncoding] = useState<LeafEncoding>(LEAF_ENCODINGS[0]);
  const [blockNumber, setBlockNumber] = useState("");
  const [result, setResult] = useState<MerkleClaimsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!walletAddress || wallet.family !== "evm") return;
    if (!ADDRESS.test(distributorAddress)) {
      setError("Enter a valid distributor address.");
      return;
    }
    if (!ADDRESS.test(claimAddress)) {
      setError("Enter a valid claim address.");
      return;
    }
    if (!treeSource.trim()) {
      setError("Enter a tree source URL, ipfs:// reference, or bare CID.");
      return;
    }
    if (blockNumber && !/^\d+$/.test(blockNumber)) {
      setError("Block number must be a positive integer.");
      return;
    }

    const requestGeneration = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/insights/merkle-claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          network,
          walletNetwork: network,
          distributorAddress,
          claimAddress,
          treeSource,
          leafEncoding,
          blockNumber: blockNumber ? Number(blockNumber) : undefined,
        }),
      });
      const payload = (await response.json()) as MerkleClaimsResult & { error?: string; message?: string };
      if (requestGeneration !== generation.current) return;
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Claim verification failed (${response.status})`);
      setResult(payload);
    } catch (caught) {
      if (requestGeneration === generation.current) {
        setError(caught instanceof Error ? caught.message : "Claim verification failed");
        setResult(null);
      }
    } finally {
      if (requestGeneration === generation.current) setBusy(false);
    }
  }

  return {
    connected,
    network,
    setNetwork,
    distributorAddress,
    setDistributorAddress,
    claimAddress,
    setClaimAddress,
    treeSource,
    setTreeSource,
    leafEncoding,
    setLeafEncoding,
    blockNumber,
    setBlockNumber,
    result,
    error,
    busy,
    submit,
  };
}
