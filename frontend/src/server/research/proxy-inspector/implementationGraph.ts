/**
 * Bounded traversal of implementation indirection.
 *
 * Two properties matter more than completeness here. The walk is *bounded* —
 * it never issues more hops than `PROXY_LIMITS.maxDepth`, so a malicious chain
 * of proxies cannot turn one inspection into hundreds of reads. And it detects
 * *cycles* — a proxy pointing at itself, or a pair pointing at each other, is
 * reported as a cycle rather than walked until the depth bound hides it.
 */
import { readCode } from "./codeReader";
import { resolveBeacon } from "./beaconResolver";
import { readStandardSlots } from "./storageReader";
import { findSlot, holdsAddress } from "./standardSlots";
import {
  PROXY_LIMITS,
  type ChainReader,
  type ImplementationHop,
  type ScopedAddress,
  type SlotObservation,
} from "./schema";

export type GraphWalk = {
  path: ImplementationHop[];
  /** Slots read at each visited address, keyed by lowercase address. */
  slotsByAddress: Map<string, SlotObservation[]>;
  /** True when a beacon was followed anywhere in the path. */
  usedBeacon: boolean;
  /** True when the walk stopped at the depth bound with a hop still pending. */
  truncated: boolean;
  cycleDetected: boolean;
};

function scope(network: string, chainId: number | null, address: string): ScopedAddress {
  return { network, chainId, address };
}

/**
 * Picks the next hop from one address's slots.
 *
 * Precedence is deliberate: a direct ERC-1967 implementation wins over a
 * beacon, which wins over the legacy slot. When both an implementation and a
 * beacon are set the caller is told about the conflict separately — the walk
 * still has to pick one, and it picks the one the standard says is read first.
 */
function nextFromSlots(slots: SlotObservation[]): { address: string; kind: ImplementationHop["kind"]; evidence: string } | null {
  const direct = findSlot(slots, "erc1967Implementation");

  if (direct && holdsAddress(direct)) {
    return {
      address: direct.decodedAddress as string,
      kind: "erc1967_direct",
      evidence: `${direct.label} (${direct.slot}) held ${direct.rawValue}.`,
    };
  }

  const beacon = findSlot(slots, "erc1967Beacon");

  if (beacon && holdsAddress(beacon)) {
    return {
      address: beacon.decodedAddress as string,
      kind: "beacon",
      evidence: `${beacon.label} (${beacon.slot}) held ${beacon.rawValue}.`,
    };
  }

  const legacy = findSlot(slots, "legacyZeppelinImplementation");

  if (legacy && holdsAddress(legacy)) {
    return {
      address: legacy.decodedAddress as string,
      kind: "legacy_slot",
      evidence: `${legacy.label} (${legacy.slot}) held ${legacy.rawValue}.`,
    };
  }

  return null;
}

export async function walkImplementationGraph(options: {
  reader: ChainReader;
  network: string;
  chainId: number | null;
  target: string;
  block: string;
  rootSlots: SlotObservation[];
}): Promise<GraphWalk> {
  const { reader, network, chainId, target, block, rootSlots } = options;

  const path: ImplementationHop[] = [];
  const slotsByAddress = new Map<string, SlotObservation[]>([[target.toLowerCase(), rootSlots]]);
  const visited = new Set<string>([target.toLowerCase()]);

  let currentAddress = target;
  let currentSlots = rootSlots;
  let usedBeacon = false;
  let truncated = false;
  let cycleDetected = false;

  for (let depth = 1; depth <= PROXY_LIMITS.maxDepth; depth += 1) {
    const step = nextFromSlots(currentSlots);

    if (!step) break;

    let resolvedAddress = step.address;
    let evidence = step.evidence;
    let kind = step.kind;

    if (step.kind === "beacon") {
      usedBeacon = true;
      const resolution = await resolveBeacon(reader, step.address, block);

      if (resolution.status !== "resolved") {
        path.push({
          depth,
          from: scope(network, chainId, currentAddress),
          to: null,
          kind: "unresolved",
          evidence: `${step.evidence} ${resolution.evidence}`,
          code: null,
        });
        break;
      }

      resolvedAddress = resolution.implementation;
      evidence = `${step.evidence} ${resolution.evidence}`;
      kind = "beacon";
    }

    const key = resolvedAddress.toLowerCase();

    if (visited.has(key)) {
      cycleDetected = true;
      path.push({
        depth,
        from: scope(network, chainId, currentAddress),
        to: scope(network, chainId, resolvedAddress),
        kind: "cycle",
        evidence: `${evidence} That address was already visited in this path, so the indirection is cyclic and the walk stopped.`,
        code: null,
      });
      break;
    }

    visited.add(key);

    const code = await readCode(reader, scope(network, chainId, resolvedAddress), block);

    path.push({
      depth,
      from: scope(network, chainId, currentAddress),
      to: scope(network, chainId, resolvedAddress),
      kind,
      evidence,
      code,
    });

    // An implementation with no code cannot itself delegate anywhere, so the
    // walk stops rather than spending reads on an address that holds nothing.
    if (!code.hasCode) break;

    const nextSlots = await readStandardSlots(reader, resolvedAddress, block);
    slotsByAddress.set(key, nextSlots);

    currentAddress = resolvedAddress;
    currentSlots = nextSlots;

    if (depth === PROXY_LIMITS.maxDepth && nextFromSlots(nextSlots)) {
      truncated = true;
      path.push({
        depth: depth + 1,
        from: scope(network, chainId, currentAddress),
        to: null,
        kind: "truncated",
        evidence: `The chain continues past the published depth bound of ${PROXY_LIMITS.maxDepth} hops and was not followed further.`,
        code: null,
      });
    }
  }

  return { path, slotsByAddress, usedBeacon, truncated, cycleDetected };
}
