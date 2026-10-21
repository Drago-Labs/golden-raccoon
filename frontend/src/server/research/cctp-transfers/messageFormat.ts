/**
 * Pure byte-offset decoding of the CCTP V2 message header and BurnMessage
 * body — no network I/O.
 *
 * Offsets are taken from Circle's `MessageV2.sol` and `BurnMessageV2.sol`
 * (the constants `*_INDEX` in `circlefin/evm-cctp-contracts`), not from a
 * docs page: a docs-page summary of these same fields disagreed with the
 * source in the field order, so the source is the only input trusted
 * here. The header and body layouts below were each confirmed against a
 * real, recently-observed testnet `DepositForBurn`/`MessageSent` pair
 * before this module was written.
 */
function hexBody(hex: string): string {
  return hex.startsWith("0x") ? hex.slice(2) : hex;
}

function sliceBytes(bodyHex: string, byteOffset: number, byteLength: number): string | null {
  const start = byteOffset * 2;
  const end = start + byteLength * 2;
  if (bodyHex.length < end) return null;
  return `0x${bodyHex.slice(start, end)}`;
}

function sliceUint(bodyHex: string, byteOffset: number, byteLength: number): number | null {
  const hex = sliceBytes(bodyHex, byteOffset, byteLength);
  if (hex === null) return null;
  return Number.parseInt(hex.slice(2), 16);
}

function sliceDecimal(bodyHex: string, byteOffset: number, byteLength: number): string | null {
  const hex = sliceBytes(bodyHex, byteOffset, byteLength);
  if (hex === null) return null;
  return BigInt(hex).toString(10);
}

export type CctpMessageHeader = {
  version: number;
  sourceDomain: number;
  destinationDomain: number;
  nonce: string;
  sender: string;
  recipient: string;
  destinationCaller: string;
  minFinalityThreshold: number;
  finalityThresholdExecuted: number;
  messageBodyHex: string;
};

const HEADER_FIXED_BYTES = 148;

export function decodeMessageHeader(messageHex: string): CctpMessageHeader | null {
  const body = hexBody(messageHex);
  if (body.length < HEADER_FIXED_BYTES * 2) return null;

  const version = sliceUint(body, 0, 4);
  const sourceDomain = sliceUint(body, 4, 4);
  const destinationDomain = sliceUint(body, 8, 4);
  const nonce = sliceBytes(body, 12, 32);
  const sender = sliceBytes(body, 44, 32);
  const recipient = sliceBytes(body, 76, 32);
  const destinationCaller = sliceBytes(body, 108, 32);
  const minFinalityThreshold = sliceUint(body, 140, 4);
  const finalityThresholdExecuted = sliceUint(body, 144, 4);

  if (
    version === null ||
    sourceDomain === null ||
    destinationDomain === null ||
    !nonce ||
    !sender ||
    !recipient ||
    !destinationCaller ||
    minFinalityThreshold === null ||
    finalityThresholdExecuted === null
  ) {
    return null;
  }

  return {
    version,
    sourceDomain,
    destinationDomain,
    nonce,
    sender,
    recipient,
    destinationCaller,
    minFinalityThreshold,
    finalityThresholdExecuted,
    messageBodyHex: `0x${body.slice(HEADER_FIXED_BYTES * 2)}`,
  };
}

export type CctpBurnMessageBody = {
  version: number;
  burnToken: string;
  mintRecipient: string;
  amountBaseUnits: string;
  messageSender: string;
  maxFeeBaseUnits: string;
  feeExecutedBaseUnits: string;
  expirationBlock: string;
  hookDataHex: string;
};

const BURN_BODY_FIXED_BYTES = 228;

export function decodeBurnMessageBody(messageBodyHex: string): CctpBurnMessageBody | null {
  const body = hexBody(messageBodyHex);
  if (body.length < BURN_BODY_FIXED_BYTES * 2) return null;

  const version = sliceUint(body, 0, 4);
  const burnToken = sliceBytes(body, 4, 32);
  const mintRecipient = sliceBytes(body, 36, 32);
  const amountBaseUnits = sliceDecimal(body, 68, 32);
  const messageSender = sliceBytes(body, 100, 32);
  const maxFeeBaseUnits = sliceDecimal(body, 132, 32);
  const feeExecutedBaseUnits = sliceDecimal(body, 164, 32);
  const expirationBlock = sliceDecimal(body, 196, 32);

  if (
    version === null ||
    !burnToken ||
    !mintRecipient ||
    amountBaseUnits === null ||
    !messageSender ||
    maxFeeBaseUnits === null ||
    feeExecutedBaseUnits === null ||
    expirationBlock === null
  ) {
    return null;
  }

  return {
    version,
    burnToken,
    mintRecipient,
    amountBaseUnits,
    messageSender,
    maxFeeBaseUnits,
    feeExecutedBaseUnits,
    expirationBlock,
    hookDataHex: `0x${body.slice(BURN_BODY_FIXED_BYTES * 2)}`,
  };
}
