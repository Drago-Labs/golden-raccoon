import type { SimulationFreshnessConfig, SimulationFreshnessResult, SimulationResultDetail } from "@/server/types";

const DEFAULT_CONFIG: SimulationFreshnessConfig = {
  maxBlockAge: 50,
  maxLedgerAge: 50,
  maxElapsedMs: 300_000,
};

export function checkSimulationFreshness(
  simulation: SimulationResultDetail,
  currentBlockNumber?: number,
  currentLedgerSeq?: number,
  configOverrides?: Partial<SimulationFreshnessConfig>,
): SimulationFreshnessResult {
  if (simulation.status === "not_required") {
    return { fresh: true };
  }

  if (simulation.status === "failed") {
    return { fresh: false, reason: "Simulation failed and must be re-run before approval." };
  }

  if (simulation.status === "unavailable") {
    return { fresh: false, reason: "Simulation result is unavailable. Re-run simulation before proceeding." };
  }

  if (simulation.status === "pending") {
    return { fresh: false, reason: "Simulation result is still pending. Wait for completion or re-run." };
  }

  if (simulation.status !== "passed") {
    return { fresh: false, reason: "Simulation status is unrecognised. Re-run to verify." };
  }

  const config = { ...DEFAULT_CONFIG, ...configOverrides };
  const now = Date.now();

  if (simulation.simulatedAt) {
    const simulatedAtMs = new Date(simulation.simulatedAt).getTime();

    if (Number.isNaN(simulatedAtMs)) {
      return { fresh: false, reason: "Simulation timestamp is invalid. Re-run simulation." };
    }

    const elapsedMs = now - simulatedAtMs;

    if (elapsedMs > config.maxElapsedMs) {
      const expiredAt = new Date(simulatedAtMs + config.maxElapsedMs).toISOString();

      return { fresh: false, reason: `Simulation expired due to elapsed time. Results are valid for ${Math.round(config.maxElapsedMs / 60_000)} minutes.`, expiredAt };
    }
  } else {
    return { fresh: false, reason: "Simulation timestamp is missing. Re-run simulation." };
  }

  if (simulation.quoteExpiry) {
    const quoteExpiryMs = new Date(simulation.quoteExpiry).getTime();

    if (!Number.isNaN(quoteExpiryMs) && now > quoteExpiryMs) {
      return { fresh: false, reason: "The price quote embedded in this simulation has expired. Re-run to get a current quote.", expiredAt: simulation.quoteExpiry };
    }
  }

  if (typeof simulation.blockNumber === "number" && typeof currentBlockNumber === "number") {
    const blockDiff = currentBlockNumber - simulation.blockNumber;

    if (blockDiff > config.maxBlockAge) {
      return { fresh: false, reason: `Simulation ran ${blockDiff} blocks ago (max ${config.maxBlockAge}). Re-run to confirm state has not changed.` };
    }
  }

  if (typeof simulation.ledgerSeq === "number" && typeof currentLedgerSeq === "number") {
    const ledgerDiff = currentLedgerSeq - simulation.ledgerSeq;

    if (ledgerDiff > config.maxLedgerAge) {
      return { fresh: false, reason: `Simulation ran ${ledgerDiff} ledgers ago (max ${config.maxLedgerAge}). Re-run to confirm state has not changed.` };
    }
  }

  return { fresh: true };
}

export function checkCalldataMatch(simulation: SimulationResultDetail, currentCalldataHash?: string): boolean {
  if (simulation.status === "not_required") return true;
  if (!simulation.calldataHash || !currentCalldataHash) return false;

  return simulation.calldataHash.toLowerCase() === currentCalldataHash.toLowerCase();
}

export function checkParamsMatch(
  simulation: SimulationResultDetail,
  currentParams: {
    amount?: string;
    route?: string[];
    slippageBps?: number;
    sequenceNumber?: number | string;
    fee?: string;
  },
): boolean {
  if (simulation.status === "not_required") return true;

  if (currentParams.amount !== undefined && simulation.fromAmount !== undefined) {
    if (currentParams.amount !== simulation.fromAmount) return false;
  }

  if (currentParams.route !== undefined && simulation.route !== undefined) {
    if (currentParams.route.length !== simulation.route.length) return false;
    for (let i = 0; i < currentParams.route.length; i++) {
      if (currentParams.route[i].toLowerCase() !== simulation.route[i].toLowerCase()) return false;
    }
  }

  if (currentParams.slippageBps !== undefined && simulation.slippageBps !== undefined) {
    if (currentParams.slippageBps !== simulation.slippageBps) return false;
  }

  if (currentParams.sequenceNumber !== undefined && simulation.sequenceNumber !== undefined) {
    if (String(currentParams.sequenceNumber) !== String(simulation.sequenceNumber)) return false;
  }

  if (currentParams.fee !== undefined && simulation.fee !== undefined) {
    if (currentParams.fee !== simulation.fee) return false;
  }

  return true;
}

export function isHighRiskExecution(action?: string, riskScore?: number): boolean {
  const tradeActions = new Set(["reduce_exposure", "swap_to_stable", "prepare_transaction"]);

  return tradeActions.has(action ?? "") && (riskScore ?? 0) >= 50;
}
