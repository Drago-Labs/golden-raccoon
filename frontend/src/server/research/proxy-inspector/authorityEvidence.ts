/**
 * Observed authority, kept apart from inferred control.
 *
 * This module is where the feature's central caveat lives. Storage can tell
 * you that the ERC-1967 admin slot holds an address. It cannot tell you who
 * can upgrade a contract, because a UUPS implementation keeps its upgrade
 * authorization in code — inside a modifier the inspector never reads. So an
 * empty admin slot yields `not_observed` with an explicit limitation, and
 * never an immutability claim.
 */
import { readCode, readerMessage } from "./codeReader";
import { findSlot, holdsAddress } from "./standardSlots";
import {
  ZERO_ADDRESS,
  type AuthorityEvidence,
  type ChainReader,
  type ScopedAddress,
  type SlotObservation,
} from "./schema";

/** `owner()` — the common, but by no means universal, beacon owner accessor. */
const OWNER_SELECTOR = "0x8da5cb5b";

const NOT_OBSERVED_LIMITATION =
  "No admin slot value was observed. This does not mean the contract is immutable: a UUPS implementation holds its upgrade authorization in code, which this inspector does not read.";

function scope(network: string, chainId: number | null, address: string): ScopedAddress {
  return { network, chainId, address };
}

function decodeOwner(raw: string): string | null {
  const trimmed = typeof raw === "string" ? raw.trim().toLowerCase() : "";

  if (!/^0x[0-9a-f]+$/.test(trimmed)) return null;

  const word = trimmed.slice(2).padStart(64, "0");

  if (word.length > 64) return null;
  if (/[1-9a-f]/.test(word.slice(0, 24))) return null;

  const address = `0x${word.slice(24)}`;

  return address === ZERO_ADDRESS ? null : address;
}

export async function collectAuthorityEvidence(options: {
  reader: ChainReader;
  network: string;
  chainId: number | null;
  block: string;
  slots: SlotObservation[];
}): Promise<AuthorityEvidence[]> {
  const { reader, network, chainId, block, slots } = options;
  const evidence: AuthorityEvidence[] = [];

  const admin = findSlot(slots, "erc1967Admin");

  if (admin && holdsAddress(admin)) {
    const holder = scope(network, chainId, admin.decodedAddress as string);
    const holderCode = await readCode(reader, holder, block);

    evidence.push({
      kind: "observed_admin_slot",
      holder,
      holderHasCode: holderCode.unavailableReason ? null : holderCode.hasCode,
      evidence: `${admin.label} (${admin.slot}) held ${admin.rawValue} at block ${block}.`,
      limitation:
        holderCode.hasCode
          ? "The admin is a contract. What that contract permits — a timelock, a multisig threshold, an immediate upgrade — is not readable from this slot."
          : "This is the address recorded in the admin slot. Whether it is the only address that can upgrade the proxy is not readable from this slot.",
    });
  } else if (admin && admin.unavailableReason) {
    evidence.push({
      kind: "not_observed",
      holder: null,
      holderHasCode: null,
      evidence: `${admin.label} (${admin.slot}) could not be read: ${admin.unavailableReason}`,
      limitation: "The admin slot was unreadable, so no statement about upgrade authority is made in either direction.",
    });
  } else if (admin && admin.isDirty) {
    evidence.push({
      kind: "not_observed",
      holder: null,
      holderHasCode: null,
      evidence: `${admin.label} (${admin.slot}) held ${admin.rawValue}, which is not an address word.`,
      limitation:
        "The admin slot held a value that is not address-shaped, which usually means unrelated state occupies it. No authority is inferred from it.",
    });
  } else {
    evidence.push({
      kind: "not_observed",
      holder: null,
      holderHasCode: null,
      evidence: admin
        ? `${admin.label} (${admin.slot}) held ${admin.rawValue ?? "no value"} at block ${block}.`
        : "The admin slot was not read.",
      limitation: NOT_OBSERVED_LIMITATION,
    });
  }

  const beacon = findSlot(slots, "erc1967Beacon");

  if (beacon && holdsAddress(beacon)) {
    const beaconAddress = beacon.decodedAddress as string;

    try {
      const raw = await reader.call(beaconAddress, OWNER_SELECTOR, block);
      const owner = decodeOwner(raw);

      if (owner) {
        const holder = scope(network, chainId, owner);

        evidence.push({
          kind: "observed_beacon_owner",
          holder,
          holderHasCode: null,
          evidence: `owner() on beacon ${beaconAddress} returned ${owner} at block ${block}.`,
          limitation:
            "A beacon owner can usually point every proxy that follows this beacon at a new implementation at once. Whether this particular beacon allows that is a property of its code, which was not read.",
        });
      } else {
        evidence.push({
          kind: "not_observed",
          holder: null,
          holderHasCode: null,
          evidence: `owner() on beacon ${beaconAddress} returned no address at block ${block}.`,
          limitation: "The beacon exposes no readable owner. It may use a different accessor, or a different access-control scheme entirely.",
        });
      }
    } catch (error) {
      evidence.push({
        kind: "not_observed",
        holder: null,
        holderHasCode: null,
        evidence: `owner() on beacon ${beaconAddress} did not return: ${readerMessage(error, "the call reverted")}`,
        limitation: "A reverting owner() is not evidence that the beacon has no owner; many beacons name that accessor differently.",
      });
    }
  }

  return evidence;
}

export { NOT_OBSERVED_LIMITATION };
