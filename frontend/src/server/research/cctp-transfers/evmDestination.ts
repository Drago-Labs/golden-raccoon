/**
 * Confirms destination completion on an EVM chain via a single read call,
 * instead of scanning logs over a block range.
 *
 * `BaseMessageTransmitter.sol` declares `mapping(bytes32 => uint256) public
 * usedNonces` — a public Solidity mapping, whose auto-generated getter
 * selector (`usedNonces(bytes32)`, `0xfeb61724`) was confirmed against the
 * live mainnet contract: calling it with the zero nonce returns `1`
 * (`BaseMessageTransmitter` reserves that nonce at construction) and with
 * an arbitrary unused nonce returns `0`. A nonzero result means the
 * message has been received and processed on this chain.
 */
import { keccak256, stringToHex } from "viem";
import type { DomainInfo } from "./domainMap";
import { evmRpcUrlFor, MESSAGE_TRANSMITTER_V2_MAINNET, MESSAGE_TRANSMITTER_V2_TESTNET } from "./domainMap";
import { CCTP_TRANSFER_LIMITS } from "./limits";
import type { DestinationStep, NetworkMode } from "./schema";

const USED_NONCES_SELECTOR = keccak256(stringToHex("usedNonces(bytes32)")).slice(0, 10);

export async function checkEvmNonceUsed(destination: DomainInfo, nonceHex: string, network: NetworkMode, fetchImpl: typeof fetch = fetch): Promise<DestinationStep> {
  const rpcUrl = evmRpcUrlFor(destination, network);
  if (!rpcUrl) {
    return { state: "unknown", destinationChain: destination.chainName, nonceUsed: null, issues: [`No RPC endpoint is configured in this tool for reading ${destination.chainName} (${network}) destination state.`] };
  }

  const transmitterAddress = network === "mainnet" ? MESSAGE_TRANSMITTER_V2_MAINNET : MESSAGE_TRANSMITTER_V2_TESTNET;
  const data = `${USED_NONCES_SELECTOR}${nonceHex.replace(/^0x/, "").padStart(64, "0")}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CCTP_TRANSFER_LIMITS.fetchTimeoutMs);

  try {
    const response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: transmitterAddress, data }, "latest"] }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { state: "unknown", destinationChain: destination.chainName, nonceUsed: null, issues: [`The destination chain RPC returned HTTP ${response.status}.`] };
    }

    const payload = (await response.json()) as { result?: string; error?: { message?: string } };
    if (payload.error) {
      return { state: "unknown", destinationChain: destination.chainName, nonceUsed: null, issues: [payload.error.message ?? "The destination chain RPC call failed."] };
    }
    if (!payload.result) {
      return { state: "unknown", destinationChain: destination.chainName, nonceUsed: null, issues: ["The destination chain RPC omitted a result."] };
    }

    const nonceUsed = BigInt(payload.result) !== BigInt(0);
    return { state: nonceUsed ? "completed" : "pending", destinationChain: destination.chainName, nonceUsed, issues: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = message.toLowerCase().includes("abort") || message.toLowerCase().includes("timeout");
    return { state: "unknown", destinationChain: destination.chainName, nonceUsed: null, issues: [timedOut ? "The destination chain RPC request timed out." : message] };
  } finally {
    clearTimeout(timer);
  }
}
