/**
 * Beacon indirection.
 *
 * A beacon proxy keeps no implementation address of its own: it holds a beacon
 * address and asks the beacon, at call time, which implementation to use. So
 * resolving one costs a call, and that call can revert — because the address
 * in the beacon slot is not a beacon, because it is an EOA, or because the
 * provider is unwell. Each of those is reported as its own outcome; none of
 * them is reported as "no implementation".
 */
import { readerMessage } from "./codeReader";
import {
  BEACON_IMPLEMENTATION_SELECTOR,
  ZERO_ADDRESS,
  type ChainReader,
} from "./schema";

export type BeaconResolution =
  | { status: "resolved"; implementation: string; evidence: string }
  | { status: "reverted"; evidence: string }
  | { status: "empty_response"; evidence: string }
  | { status: "dirty_response"; evidence: string };

function decodeAddressWord(raw: string): { address: string | null; dirty: boolean } {
  const trimmed = typeof raw === "string" ? raw.trim().toLowerCase() : "";

  if (!/^0x[0-9a-f]*$/.test(trimmed)) return { address: null, dirty: true };

  const body = trimmed.slice(2);

  if (body.length === 0) return { address: null, dirty: false };
  if (body.length > 64) return { address: null, dirty: true };

  const word = body.padStart(64, "0");

  if (/[1-9a-f]/.test(word.slice(0, 24))) return { address: null, dirty: true };

  const address = `0x${word.slice(24)}`;

  return { address: address === ZERO_ADDRESS ? null : address, dirty: false };
}

export async function resolveBeacon(
  reader: ChainReader,
  beacon: string,
  block: string,
): Promise<BeaconResolution> {
  let raw: string;

  try {
    raw = await reader.call(beacon, BEACON_IMPLEMENTATION_SELECTOR, block);
  } catch (error) {
    return {
      status: "reverted",
      evidence: `implementation() on beacon ${beacon} at block ${block} did not return: ${readerMessage(error, "the call reverted")}`,
    };
  }

  const decoded = decodeAddressWord(raw);

  if (decoded.dirty) {
    return {
      status: "dirty_response",
      evidence: `implementation() on beacon ${beacon} returned ${String(raw).slice(0, 74)}, which is not an address word.`,
    };
  }

  if (decoded.address === null) {
    return {
      status: "empty_response",
      evidence: `implementation() on beacon ${beacon} returned no address at block ${block}.`,
    };
  }

  return {
    status: "resolved",
    implementation: decoded.address,
    evidence: `implementation() on beacon ${beacon} returned ${decoded.address} at block ${block}.`,
  };
}
