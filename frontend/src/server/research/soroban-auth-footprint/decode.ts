import { AUTH_LIMITS, type AuthNode } from "./schema";

type RawAuthEntry = {
  address?: string;
  contractId?: string;
  contract?: string;
  function?: string;
  functionName?: string;
  argumentHash?: string;
  argsHash?: string;
  nonce?: string | number;
  expirationLedger?: number;
  networkPassphrase?: string;
  children?: RawAuthEntry[];
  unsupportedScVal?: boolean;
  unknownContract?: boolean;
};

function asEntryList(payload: unknown): RawAuthEntry[] {
  if (Array.isArray(payload)) return payload as RawAuthEntry[];
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.auth)) return record.auth as RawAuthEntry[];
    if (Array.isArray(record.entries)) return record.entries as RawAuthEntry[];
    if (record.result && typeof record.result === "object") {
      const result = record.result as Record<string, unknown>;
      if (Array.isArray(result.auth)) return result.auth as RawAuthEntry[];
    }
  }
  throw new Error("Simulation JSON must include an auth or entries array");
}

export function parseSimulationAuthTree(
  simulationJson: string,
  expectedPassphrase: string | null,
  evaluatedLedger: number | null,
): { nodes: AuthNode[]; warnings: string[] } {
  if (simulationJson.length > AUTH_LIMITS.maxPayloadChars) {
    throw new Error("Simulation JSON exceeds bounded size");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(simulationJson);
  } catch {
    throw new Error("Simulation JSON is malformed");
  }

  const roots = asEntryList(parsed);
  if (roots.length > AUTH_LIMITS.maxAuthEntries) {
    throw new Error("Auth entry count exceeds bound");
  }

  const nodes: AuthNode[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, string>();

  function walk(entry: RawAuthEntry, parentId: string | null, depth: number) {
    if (depth > AUTH_LIMITS.maxNestingDepth) {
      warnings.push("Auth nesting exceeded bound; deeper nodes were not decoded.");
      return;
    }
    const id = `auth-${nodes.length + 1}`;
    const contractId = entry.contractId ?? entry.contract ?? null;
    const functionName = entry.functionName ?? entry.function ?? null;
    const argumentHash = entry.argumentHash ?? entry.argsHash ?? null;
    const nonce = entry.nonce === undefined || entry.nonce === null ? null : String(entry.nonce);
    const expirationLedger = entry.expirationLedger ?? null;
    const networkPassphrase = entry.networkPassphrase ?? null;
    const flags: AuthNode["flags"] = [];

    if (entry.unknownContract || !contractId) flags.push("unknown_contract");
    if (entry.unsupportedScVal) flags.push("unsupported_scval");
    if (networkPassphrase && expectedPassphrase && networkPassphrase !== expectedPassphrase) {
      flags.push("network_mismatch");
    }
    if (
      expirationLedger !== null &&
      evaluatedLedger !== null &&
      expirationLedger <= evaluatedLedger + 10
    ) {
      flags.push("expiring");
    }

    const fingerprint = `${contractId ?? "?"}|${functionName ?? "?"}|${argumentHash ?? "?"}|${nonce ?? "?"}`;
    if (seen.has(fingerprint)) {
      flags.push("duplicate");
      const prior = seen.get(fingerprint);
      if (prior && prior !== id) flags.push("conflicting");
    } else {
      seen.set(fingerprint, id);
    }

    nodes.push({
      id,
      parentId,
      address: entry.address ?? null,
      contractId,
      functionName,
      argumentHash,
      nonce,
      expirationLedger,
      networkPassphrase,
      depth,
      flags,
      note:
        flags.length === 0
          ? "Auth entry decoded from simulation fixture."
          : `Auth entry flagged: ${flags.join(", ")}. Unknown authorization is never treated as approved.`,
    });

    for (const child of entry.children ?? []) walk(child, id, depth + 1);
  }

  for (const root of roots) walk(root, null, 0);
  if (!nodes.length) warnings.push("No auth entries were present in the simulation payload.");
  return { nodes, warnings };
}

export function assertEnvelopeBounds(envelopeXdr: string) {
  if (envelopeXdr.length > AUTH_LIMITS.maxPayloadChars) {
    throw new Error("Envelope XDR exceeds bounded size");
  }
  if (!/^[A-Za-z0-9+/=_-]+$/.test(envelopeXdr.replace(/\s+/g, ""))) {
    throw new Error("Envelope XDR is malformed");
  }
}
