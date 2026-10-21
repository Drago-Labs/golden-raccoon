/**
 * Reads a source-chain transaction receipt and decodes its
 * `DepositForBurn` / `MessageSent` evidence.
 *
 * Event topic0 hashes and the `DepositForBurn` parameter list are taken
 * from `TokenMessengerV2.sol`'s and `MessageTransmitterV2.sol`'s actual
 * event declarations in `circlefin/evm-cctp-contracts` — an AI-summarized
 * docs page gave a different (wrong) parameter list for this same event,
 * which is why this module is keyed to the source file, not the docs.
 * The raw `message` bytes are decoded independently via
 * `messageFormat.ts` rather than trusted from any pre-parsed field.
 */
import { decodeAbiParameters, keccak256, parseAbiParameters, stringToHex } from "viem";
import { decodeBurnMessageBody, decodeMessageHeader } from "./messageFormat";
import { describeDomain, domainInfo, evmRpcUrlFor, formatCrossChainAddress, MESSAGE_TRANSMITTER_V2_MAINNET, MESSAGE_TRANSMITTER_V2_TESTNET, TOKEN_MESSENGER_V2_MAINNET, TOKEN_MESSENGER_V2_TESTNET } from "./domainMap";
import { CCTP_TRANSFER_LIMITS } from "./limits";
import type { BurnStep, NetworkMode } from "./schema";

const DEPOSIT_FOR_BURN_TOPIC = keccak256(stringToHex("DepositForBurn(address,uint256,address,bytes32,uint32,bytes32,bytes32,uint256,uint32,bytes)"));
const MESSAGE_SENT_TOPIC = keccak256(stringToHex("MessageSent(bytes)"));

const DEPOSIT_FOR_BURN_DATA_PARAMS = parseAbiParameters(
  "uint256 amount, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller, uint256 maxFee, bytes hookData",
);

type RpcLog = { address: string; topics: string[]; data: string };
type RpcReceipt = { status: string; blockNumber: string; logs: RpcLog[] } | null;

async function callRpc(url: string, method: string, params: unknown[], fetchImpl: typeof fetch): Promise<{ result?: unknown; error?: { message?: string } }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CCTP_TRANSFER_LIMITS.fetchTimeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) return { error: { message: `HTTP status ${response.status}` } };
    return (await response.json()) as { result?: unknown; error?: { message?: string } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: { message: message.toLowerCase().includes("abort") ? "Request timed out" : message } };
  } finally {
    clearTimeout(timer);
  }
}

function emptyBurnStep(state: BurnStep["state"], destinationChain: string, issues: string[]): BurnStep {
  return {
    state,
    blockNumber: null,
    nonce: null,
    burnTokenAddress: null,
    depositorAddress: null,
    mintRecipientRaw: null,
    mintRecipientDisplay: null,
    destinationDomain: null,
    destinationChain,
    maxFeeBaseUnits: null,
    minFinalityThreshold: null,
    amountBaseUnits: null,
    rawMessageHex: null,
    issues,
  };
}

export async function decodeSourceBurn(
  sourceChainName: string,
  sourceDomain: number,
  transactionHash: string,
  network: NetworkMode,
  fetchImpl: typeof fetch = fetch,
): Promise<BurnStep> {
  const info = domainInfo(sourceDomain);
  const rpcUrl = info ? evmRpcUrlFor(info, network) : null;

  if (!info || info.kind !== "evm" || !rpcUrl) {
    return emptyBurnStep("unknown", "not yet known", [`No RPC endpoint is configured in this tool for reading ${sourceChainName} (${network}) source transactions.`]);
  }

  const { result, error } = await callRpc(rpcUrl, "eth_getTransactionReceipt", [transactionHash], fetchImpl);
  if (error) {
    return emptyBurnStep("unknown", "not yet known", [error.message ?? "The source chain RPC request failed."]);
  }

  const receipt = result as RpcReceipt;
  if (!receipt) {
    return emptyBurnStep("pending", "not yet known", ["The transaction was not found — it may not be mined yet, or the hash or chain is incorrect."]);
  }
  if (receipt.status === "0x0") {
    return emptyBurnStep("failed", "not yet known", ["The source transaction reverted; no burn occurred."]);
  }

  const messengerAddress = network === "mainnet" ? TOKEN_MESSENGER_V2_MAINNET : TOKEN_MESSENGER_V2_TESTNET;
  const transmitterAddress = network === "mainnet" ? MESSAGE_TRANSMITTER_V2_MAINNET : MESSAGE_TRANSMITTER_V2_TESTNET;

  const depositLog = receipt.logs.find((log) => log.address.toLowerCase() === messengerAddress.toLowerCase() && log.topics[0]?.toLowerCase() === DEPOSIT_FOR_BURN_TOPIC);
  const messageSentLog = receipt.logs.find((log) => log.address.toLowerCase() === transmitterAddress.toLowerCase() && log.topics[0]?.toLowerCase() === MESSAGE_SENT_TOPIC);

  if (!depositLog || !messageSentLog) {
    return emptyBurnStep("unknown", "not yet known", ["This transaction has no DepositForBurn/MessageSent log from the known CCTP V2 contracts — it may not be a CCTP burn."]);
  }

  const [rawMessageHex] = decodeAbiParameters(parseAbiParameters("bytes message"), messageSentLog.data as `0x${string}`);
  const header = decodeMessageHeader(rawMessageHex);
  if (!header) {
    return emptyBurnStep("unknown", "not yet known", ["The MessageSent event's raw message could not be decoded."]);
  }
  const burnBody = decodeBurnMessageBody(header.messageBodyHex);
  if (!burnBody) {
    return emptyBurnStep("unknown", "not yet known", ["The CCTP burn message body could not be decoded."]);
  }

  const [, burnTokenTopic, depositorTopic] = depositLog.topics;
  const decodedData = decodeAbiParameters(DEPOSIT_FOR_BURN_DATA_PARAMS, depositLog.data as `0x${string}`);
  const [, mintRecipientFromEvent, , , , ,] = decodedData;

  const destinationInfo = domainInfo(header.destinationDomain);

  return {
    state: "completed",
    blockNumber: Number.parseInt(receipt.blockNumber, 16),
    nonce: header.nonce,
    burnTokenAddress: burnTokenTopic ? `0x${burnTokenTopic.slice(-40)}` : null,
    depositorAddress: depositorTopic ? `0x${depositorTopic.slice(-40)}` : null,
    mintRecipientRaw: burnBody.mintRecipient,
    mintRecipientDisplay: formatCrossChainAddress(destinationInfo, mintRecipientFromEvent as string),
    destinationDomain: header.destinationDomain,
    destinationChain: describeDomain(header.destinationDomain),
    maxFeeBaseUnits: burnBody.maxFeeBaseUnits,
    minFinalityThreshold: header.minFinalityThreshold,
    amountBaseUnits: burnBody.amountBaseUnits,
    rawMessageHex,
    issues: [],
  };
}
