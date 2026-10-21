import { encodeAbiParameters, keccak256, parseAbiParameters, stringToHex } from "viem";
import type { CctpTransferDeps } from "@/server/research/cctp-transfers/service";

export const DEPOSIT_FOR_BURN_TOPIC = keccak256(stringToHex("DepositForBurn(address,uint256,address,bytes32,uint32,bytes32,bytes32,uint256,uint32,bytes)"));
export const MESSAGE_SENT_TOPIC = keccak256(stringToHex("MessageSent(bytes)"));

export const TOKEN_MESSENGER_V2_TESTNET = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";
export const MESSAGE_TRANSMITTER_V2_TESTNET = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";

function pad32(hexNoPrefix: string): string {
  return hexNoPrefix.padStart(64, "0");
}

/** Pads a hex string (no 0x) to exactly `byteLength` bytes — the CCTP header packs some fields as 4 bytes, others as 32. */
function padBytes(hexNoPrefix: string, byteLength: number): string {
  return hexNoPrefix.padStart(byteLength * 2, "0");
}

function addressTopic(address: string): string {
  return `0x${pad32(address.replace(/^0x/, "").toLowerCase())}`;
}

function uintTopic(value: number): string {
  return `0x${pad32(value.toString(16))}`;
}

export function addressToBytes32(address: string): string {
  return `0x${pad32(address.replace(/^0x/, "").toLowerCase())}`;
}

/** Builds a real-shaped CCTP V2 message (148-byte header + 228+ byte BurnMessage body). */
export function buildCctpMessageHex(input: {
  sourceDomain: number;
  destinationDomain: number;
  nonceHex: string;
  senderAddress: string;
  recipientBytes32: string;
  destinationCallerBytes32?: string;
  minFinalityThreshold?: number;
  finalityThresholdExecuted?: number;
  burnTokenAddress: string;
  mintRecipientBytes32: string;
  amountBaseUnits: string;
  messageSenderAddress: string;
  maxFeeBaseUnits?: string;
  feeExecutedBaseUnits?: string;
  expirationBlock?: string;
  hookDataHex?: string;
}): string {
  const header =
    padBytes((1).toString(16), 4) + // version
    padBytes(input.sourceDomain.toString(16), 4) +
    padBytes(input.destinationDomain.toString(16), 4) +
    padBytes(input.nonceHex.replace(/^0x/, ""), 32) +
    padBytes(input.senderAddress.replace(/^0x/, "").toLowerCase(), 32) +
    padBytes(input.recipientBytes32.replace(/^0x/, ""), 32) +
    padBytes((input.destinationCallerBytes32 ?? "0x" + "0".repeat(64)).replace(/^0x/, ""), 32) +
    padBytes((input.minFinalityThreshold ?? 1000).toString(16), 4) +
    padBytes((input.finalityThresholdExecuted ?? 1000).toString(16), 4);

  const hookData = (input.hookDataHex ?? "").replace(/^0x/, "");
  const body =
    padBytes((1).toString(16), 4) + // version
    padBytes(input.burnTokenAddress.replace(/^0x/, "").toLowerCase(), 32) +
    padBytes(input.mintRecipientBytes32.replace(/^0x/, ""), 32) +
    padBytes(BigInt(input.amountBaseUnits).toString(16), 32) +
    padBytes(input.messageSenderAddress.replace(/^0x/, "").toLowerCase(), 32) +
    padBytes(BigInt(input.maxFeeBaseUnits ?? "0").toString(16), 32) +
    padBytes(BigInt(input.feeExecutedBaseUnits ?? "0").toString(16), 32) +
    padBytes(BigInt(input.expirationBlock ?? "0").toString(16), 32) +
    hookData;

  return `0x${header}${body}`;
}

export function buildDepositForBurnLog(input: {
  burnTokenAddress: string;
  amountBaseUnits: string;
  depositorAddress: string;
  mintRecipientBytes32: string;
  destinationDomain: number;
  destinationTokenMessengerBytes32?: string;
  destinationCallerBytes32?: string;
  maxFeeBaseUnits?: string;
  minFinalityThreshold?: number;
  hookDataHex?: `0x${string}`;
}) {
  const data = encodeAbiParameters(
    parseAbiParameters("uint256 amount, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller, uint256 maxFee, bytes hookData"),
    [
      BigInt(input.amountBaseUnits),
      input.mintRecipientBytes32 as `0x${string}`,
      input.destinationDomain,
      (input.destinationTokenMessengerBytes32 ?? `0x${"0".repeat(64)}`) as `0x${string}`,
      (input.destinationCallerBytes32 ?? `0x${"0".repeat(64)}`) as `0x${string}`,
      BigInt(input.maxFeeBaseUnits ?? "0"),
      input.hookDataHex ?? "0x",
    ],
  );

  return {
    address: TOKEN_MESSENGER_V2_TESTNET,
    topics: [DEPOSIT_FOR_BURN_TOPIC, addressTopic(input.burnTokenAddress), addressTopic(input.depositorAddress), uintTopic(input.minFinalityThreshold ?? 1000)],
    data,
  };
}

export function buildMessageSentLog(messageHex: string) {
  return {
    address: MESSAGE_TRANSMITTER_V2_TESTNET,
    topics: [MESSAGE_SENT_TOPIC],
    data: encodeAbiParameters(parseAbiParameters("bytes message"), [messageHex as `0x${string}`]),
  };
}

export function stubRpcFetch(responses: { receipt?: unknown; ethCallResult?: string } = {}) {
  return (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method: string };
    if (body.method === "eth_getTransactionReceipt") {
      return { ok: true, status: 200, json: async () => ({ result: responses.receipt ?? null }) } as unknown as Response;
    }
    if (body.method === "eth_call") {
      return { ok: true, status: 200, json: async () => ({ result: responses.ethCallResult ?? `0x${"0".repeat(64)}` }) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({ result: null }) } as unknown as Response;
  }) as unknown as typeof fetch;
}

export function stubIrisFetch(responseBody: unknown, status = 200) {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(responseBody),
    }) as unknown as Response) as unknown as typeof fetch;
}

export function noopDeps(): CctpTransferDeps {
  return {
    decodeSourceBurn: async () => ({
      state: "unknown",
      blockNumber: null,
      nonce: null,
      burnTokenAddress: null,
      depositorAddress: null,
      mintRecipientRaw: null,
      mintRecipientDisplay: null,
      destinationDomain: null,
      destinationChain: "not yet known",
      maxFeeBaseUnits: null,
      minFinalityThreshold: null,
      amountBaseUnits: null,
      rawMessageHex: null,
      issues: ["stub"],
    }),
    fetchAttestation: async () => ({
      state: "unknown",
      status: "unavailable",
      feeExecutedBaseUnits: null,
      cctpVersion: null,
      destinationMintTxHashReported: null,
      attestedMessageHex: null,
      issues: ["stub"],
    }),
    checkEvmNonceUsed: async (destination) => ({ state: "unknown", destinationChain: destination.chainName, nonceUsed: null, issues: ["stub"] }),
    checkStellarNonceUsed: async () => ({ state: "unknown", destinationChain: "Stellar", nonceUsed: null, issues: ["stub"] }),
  };
}

export function request(overrides: Record<string, unknown> = {}) {
  return { sourceChain: "Ethereum", transactionHash: "0xcfc0abf8b9251719212a90edadf9ca1866b0e9e7ab4952eaf648701562fabec", network: "testnet", ...overrides };
}
