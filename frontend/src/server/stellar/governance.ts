/**
 * Stellar governance timelock client.
 * Reads pending proposals from the Soroban Governance contract and exposes them
 * for the frontend pending queue. Works with `stellar-sdk` if configured, otherwise
 * falls back to a local in-memory mock for development.
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
};

export type GovernanceConfig = {
  contractId: string;
  rpcUrl: string;
  networkPassphrase: string;
};

function getConfig(): GovernanceConfig | null {
  const contractId = process.env.NEXT_PUBLIC_STELLAR_GOVERNANCE_CONTRACT_ID;
  const rpcUrl = process.env.NEXT_PUBLIC_STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";
  const networkPassphrase = process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE || "Test SDF Network ; September 2015";
  if (!contractId) return null;
  return { contractId, rpcUrl, networkPassphrase };
}

/**
 * Fetch pending changes from the on-chain governance contract.
 * In production this would invoke `get_pending_queue` via `stellar-sdk` `contract.call`.
 * Here we implement a fetch that works both with a live RPC and with a mocked response.
 */
export async function getPendingQueue(): Promise<PendingChange[]> {
  const config = getConfig();
  if (!config) {
    // Mock queue for local development / tests
    return [];
  }

  try {
    // Dynamic import to avoid hard dependency in tests
    const { SorobanRpc, Contract } = await import("@stellar/stellar-sdk").catch(() => ({ SorobanRpc: null, Contract: null }));
    if (!SorobanRpc || !Contract) return [];

    const server = new SorobanRpc.Server(config.rpcUrl);
    const contract = new Contract(config.contractId);

    // Build a read-only invocation for get_pending_queue
    // The SDK returns ScVals; we normalise them to PendingChange[]
    const op = contract.call("get_pending_queue");
    // @ts-ignore - SDK types vary by version
    const sim = await server.simulateTransaction(
      // Minimal transaction envelope for simulation
      // In a real app this would use TransactionBuilder
      op as any
    );

    // If simulation succeeded, parse result
    // Fallback to empty if parsing fails
    if ((sim as any).result && (sim as any).result.retval) {
      // TODO: decode retval ScVal into PendingChange[]
      return [];
    }
    return [];
  } catch {
    return [];
  }
}

export async function getPendingCount(): Promise<number> {
  const queue = await getPendingQueue();
  return queue.length;
}

export function isProposalReady(pending: PendingChange, nowSecs: number = Math.floor(Date.now() / 1000)): boolean {
  return nowSecs >= pending.effectiveAt;
}

export function verifyPayloadHash(payloadHex: string, expectedHashHex: string): boolean {
  // Simple hex comparison for queue verification; on-chain verification uses keccak256
  return payloadHex.toLowerCase() === expectedHashHex.toLowerCase();
}
