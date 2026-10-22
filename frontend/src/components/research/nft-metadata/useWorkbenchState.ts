"use client";

import { useRef, useState, type FormEvent } from "react";
import { useWalletSession } from "@/hooks/useWalletSession";
import type { NftMetadataResult } from "@/server/research/nft-metadata";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TOKEN_ID = /^(0|[1-9]\d*)$/;
export const SUPPORTED_NETWORKS = ["ethereum", "base", "arbitrum", "polygon", "optimism", "bsc", "avalanche"] as const;
const MAX_SAMPLE_TOKEN_IDS = 5;

/**
 * Owns all form/request state for the NFT metadata workbench. Split out
 * of the container component so the fetch/race-condition logic can be
 * exercised without rendering anything.
 */
export function useWorkbenchState() {
  const wallet = useWalletSession();
  const address = wallet.family === "evm" ? wallet.address : undefined;
  const connected = Boolean(address && wallet.family === "evm" && wallet.isConnected);

  const [network, setNetwork] = useState<string>(SUPPORTED_NETWORKS[0]);
  const [contractAddress, setContractAddress] = useState("");
  const [blockNumber, setBlockNumber] = useState("");
  const [tokenIds, setTokenIds] = useState<string[]>([]);
  const [tokenIdDraft, setTokenIdDraft] = useState("");
  const [result, setResult] = useState<NftMetadataResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  function addTokenId() {
    if (!TOKEN_ID.test(tokenIdDraft)) {
      setError("Enter a non-negative integer token ID.");
      return;
    }
    if (tokenIds.length >= MAX_SAMPLE_TOKEN_IDS) {
      setError(`At most ${MAX_SAMPLE_TOKEN_IDS} token IDs can be sampled at once.`);
      return;
    }
    setTokenIds((current) => [...current, tokenIdDraft]);
    setTokenIdDraft("");
    setError(null);
  }

  function removeTokenId(index: number) {
    setTokenIds((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || wallet.family !== "evm") return;
    if (!ADDRESS.test(contractAddress)) {
      setError("Enter a valid collection address.");
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
      const response = await fetch("/api/insights/nft-metadata", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          network,
          walletNetwork: network,
          contractAddress,
          blockNumber: blockNumber ? Number(blockNumber) : undefined,
          tokenIds: tokenIds.length ? tokenIds : undefined,
        }),
      });
      const payload = (await response.json()) as NftMetadataResult & { error?: string; message?: string };
      if (requestGeneration !== generation.current) return;
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Metadata inspection failed (${response.status})`);
      setResult(payload);
    } catch (caught) {
      if (requestGeneration === generation.current) {
        setError(caught instanceof Error ? caught.message : "Metadata inspection failed");
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
    contractAddress,
    setContractAddress,
    blockNumber,
    setBlockNumber,
    tokenIds,
    tokenIdDraft,
    setTokenIdDraft,
    addTokenId,
    removeTokenId,
    result,
    error,
    busy,
    submit,
  };
}
