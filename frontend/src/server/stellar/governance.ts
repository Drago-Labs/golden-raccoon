/**
 * Stellar governance timelock client.
 * Failed reads never collapse to an empty-success queue.
 */
export type PendingChange = {
  id: string;
  targetContract: string;
  functionSelector: string;
  payloadHash: string;
  proposer: string;
  createdAt: number;
  effectiveAt: number;
  delaySecs: number;
  signersCount: number;
  threshold: number;
  sourceLedger: number | null;
  cancelled: boolean;
};

export type GovernanceConfig = {
  contractId: string;
  rpcUrl: string;
  networkPassphrase: string;
  network: "testnet" | "pubnet";
};

export type QueueState =
  | "uninitialized"
  | "empty"
  | "non_empty"
  | "partial"
  | "stale"
  | "malformed"
  | "unsupported_version"
  | "provider_error";

export type GovernanceQueueResult = {
  state: QueueState;
  network: "testnet" | "pubnet" | null;
  contractId: string | null;
  observedAtSecs: number;
  ledger: number | null;
  items: PendingChange[];
  warnings: string[];
  /** Timelock readiness never implies authorized or safe to execute. */
  scoreUnchanged: true;
};

export type RpcAdapter = {
  simulateGetPendingQueue: (config: GovernanceConfig) => Promise<{
    retval: unknown;
    latestLedger: number;
  }>;
};

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const PUBNET_PASSPHRASE = "Public Global Stellar Network ; September 2015";

export function getConfig(env: NodeJS.ProcessEnv = process.env): GovernanceConfig | null {
  const contractId = env.NEXT_PUBLIC_STELLAR_GOVERNANCE_CONTRACT_ID?.trim();
  if (!contractId) return null;
  if (contractId.startsWith("S")) {
    throw new Error("Secret keys are rejected");
  }
  const rpcUrl = env.NEXT_PUBLIC_STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";
  const networkPassphrase = env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE || TESTNET_PASSPHRASE;
  const network = networkPassphrase === PUBNET_PASSPHRASE ? "pubnet" : "testnet";
  if (network === "testnet" && networkPassphrase !== TESTNET_PASSPHRASE) {
    throw new Error("Network passphrase does not match testnet");
  }
  if (network === "pubnet" && !rpcUrl.includes("mainnet") && env.NEXT_PUBLIC_STELLAR_NETWORK !== "pubnet") {
    // Allow explicit pubnet passphrase with custom RPC.
  }
  return { contractId, rpcUrl, networkPassphrase, network };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Decode a simulated or fixture retval into typed pending changes. */
export function decodePendingQueue(retval: unknown): { state: QueueState; items: PendingChange[]; warnings: string[] } {
  if (retval == null) return { state: "empty", items: [], warnings: [] };
  if (typeof retval === "object" && retval !== null && "unsupported" in (retval as object)) {
    return { state: "unsupported_version", items: [], warnings: ["Unsupported governance contract version"] };
  }
  const list = Array.isArray(retval) ? retval : (asRecord(retval)?.items as unknown);
  if (!Array.isArray(list)) return { state: "malformed", items: [], warnings: ["Queue retval was not a list"] };

  const items: PendingChange[] = [];
  const warnings: string[] = [];
  for (const entry of list) {
    const row = asRecord(entry);
    if (!row) {
      warnings.push("Skipped a non-object pending entry");
      continue;
    }
    const id = readString(row.id);
    const targetContract = readString(row.targetContract) ?? readString(row.target);
    const functionSelector = readString(row.functionSelector) ?? readString(row.function) ?? "";
    const payloadHash = readString(row.payloadHash) ?? readString(row.hash);
    const proposer = readString(row.proposer) ?? "";
    const createdAt = readNumber(row.createdAt);
    const effectiveAt = readNumber(row.effectiveAt);
    const delaySecs = readNumber(row.delaySecs) ?? 0;
    const signersCount = readNumber(row.signersCount) ?? 0;
    const threshold = readNumber(row.threshold) ?? 0;
    const sourceLedger = readNumber(row.sourceLedger);
    const cancelled = Boolean(row.cancelled);
    if (!id || !targetContract || !payloadHash || createdAt == null || effectiveAt == null) {
      warnings.push(`Malformed pending entry ${id ?? "unknown"}`);
      continue;
    }
    if (targetContract.startsWith("S") || proposer.startsWith("S")) {
      warnings.push(`Rejected secret-looking address in entry ${id}`);
      continue;
    }
    items.push({
      id,
      targetContract,
      functionSelector,
      payloadHash,
      proposer,
      createdAt,
      effectiveAt,
      delaySecs,
      signersCount,
      threshold,
      sourceLedger,
      cancelled,
    });
  }

  if (items.length === 0 && list.length > 0) return { state: "malformed", items: [], warnings };
  if (items.length === 0) return { state: "empty", items: [], warnings };
  if (warnings.length > 0) return { state: "partial", items, warnings };
  return { state: "non_empty", items, warnings };
}

export function isProposalReady(pending: PendingChange, nowSecs: number = Math.floor(Date.now() / 1000)): boolean {
  if (pending.cancelled) return false;
  return nowSecs >= pending.effectiveAt;
}

export function verifyPayloadHash(payloadHex: string, expectedHashHex: string): boolean {
  return payloadHex.toLowerCase() === expectedHashHex.toLowerCase();
}

async function defaultRpcAdapter(config: GovernanceConfig): Promise<{ retval: unknown; latestLedger: number }> {
  const stellar = await import("@stellar/stellar-sdk").catch(() => null);
  if (!stellar) throw new Error("Stellar SDK unavailable");
  const { Contract, rpc, TransactionBuilder, Networks, Account, BASE_FEE } = stellar as typeof import("@stellar/stellar-sdk") & {
    rpc: { Server: new (url: string) => { getAccount: (id: string) => Promise<{ sequenceNumber: () => string }>; simulateTransaction: (tx: unknown) => Promise<{ result?: { retval?: unknown }; latestLedger?: number }> } };
  };
  const Server = rpc?.Server ?? (stellar as { SorobanRpc?: { Server: typeof rpc.Server } }).SorobanRpc?.Server;
  if (!Server || !Contract || !TransactionBuilder) throw new Error("Soroban RPC client unavailable");
  const server = new Server(config.rpcUrl);
  const contract = new Contract(config.contractId);
  const account = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase === PUBNET_PASSPHRASE ? Networks.PUBLIC : Networks.TESTNET,
  })
    .addOperation(contract.call("get_pending_queue"))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (!sim || !(sim as { result?: unknown }).result) throw new Error("Simulation returned no result");
  return {
    retval: (sim as { result?: { retval?: unknown } }).result?.retval ?? null,
    latestLedger: Number((sim as { latestLedger?: number }).latestLedger ?? 0) || null as unknown as number,
  };
}

export async function readPendingQueue(deps: { adapter?: RpcAdapter; env?: NodeJS.ProcessEnv; nowSecs?: number } = {}): Promise<GovernanceQueueResult> {
  const observedAtSecs = deps.nowSecs ?? Math.floor(Date.now() / 1000);
  let config: GovernanceConfig | null;
  try {
    config = getConfig(deps.env);
  } catch (error) {
    return {
      state: "malformed",
      network: null,
      contractId: null,
      observedAtSecs,
      ledger: null,
      items: [],
      warnings: [error instanceof Error ? error.message : "Invalid governance config"],
      scoreUnchanged: true,
    };
  }
  if (!config) {
    return {
      state: "uninitialized",
      network: null,
      contractId: null,
      observedAtSecs,
      ledger: null,
      items: [],
      warnings: ["NEXT_PUBLIC_STELLAR_GOVERNANCE_CONTRACT_ID is not set"],
      scoreUnchanged: true,
    };
  }

  try {
    const adapter = deps.adapter ?? { simulateGetPendingQueue: defaultRpcAdapter };
    const { retval, latestLedger } = await adapter.simulateGetPendingQueue(config);
    const decoded = decodePendingQueue(retval);
    let state = decoded.state;
    const warnings = [...decoded.warnings];
    if (latestLedger != null && latestLedger > 0) {
      for (const item of decoded.items) {
        if (item.sourceLedger != null && item.sourceLedger > latestLedger) {
          state = "stale";
          warnings.push(`Entry ${item.id} cites ledger ${item.sourceLedger} ahead of observed ${latestLedger}`);
        }
      }
    }
    return {
      state,
      network: config.network,
      contractId: config.contractId,
      observedAtSecs,
      ledger: latestLedger || null,
      items: decoded.items,
      warnings,
      scoreUnchanged: true,
    };
  } catch (error) {
    return {
      state: "provider_error",
      network: config.network,
      contractId: config.contractId,
      observedAtSecs,
      ledger: null,
      items: [],
      warnings: [error instanceof Error ? error.message : "Governance RPC failed"],
      scoreUnchanged: true,
    };
  }
}

/** @deprecated Prefer readPendingQueue — this throws on provider errors instead of returning []. */
export async function getPendingQueue(): Promise<PendingChange[]> {
  const result = await readPendingQueue();
  if (result.state === "provider_error" || result.state === "malformed" || result.state === "unsupported_version") {
    throw new Error(result.warnings[0] ?? "Failed to read governance queue");
  }
  return result.items.filter((item) => !item.cancelled);
}

export async function getPendingCount(): Promise<number> {
  const queue = await getPendingQueue();
  return queue.length;
}
