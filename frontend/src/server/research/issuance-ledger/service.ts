import { assetKey, validateAssetIdentity, type StellarNetwork } from "./assetIdentity";
import { classifyOperations, type RawIssuerOperation } from "./classification";
import { evaluateCheckpoints, type CheckpointInput } from "./checkpoints";
import { coverageNotice } from "./coverage";
import { IssuanceLedgerError, type IssuanceLedgerState } from "./errors";
import { readIssuerHistory, type IssuerRead, type ReadOutcome } from "./issuerOperations";
import { claimReconciled, collectUnreconciled } from "./reconciliation";
import { applyRunningSupply, finalSupply } from "./runningSupply";
import {
  ISSUANCE_SCHEMA_VERSION,
  issuanceRequestSchema,
  type IssuanceReport,
  type LedgerOperation,
  type SupplyCheckpoint,
} from "./schema";

export type IssuanceDeps = {
  readHistory: (
    network: StellarNetwork,
    assetCode: string,
    issuer: string,
    fromLedger: number,
    toLedger: number,
  ) => Promise<ReadOutcome<IssuerRead>>;
};

const productionDeps: IssuanceDeps = {
  readHistory: async (network, assetCode, issuer, fromLedger, toLedger) => {
    const asset = validateAssetIdentity(assetCode, issuer);
    return readIssuerHistory(network, asset, fromLedger, toLedger);
  },
};

function unavailableReport(
  assetCode: string,
  issuer: string,
  network: StellarNetwork,
  fromLedger: number,
  toLedger: number,
  reason: string,
): IssuanceReport {
  return {
    schemaVersion: ISSUANCE_SCHEMA_VERSION,
    assetCode,
    issuer,
    assetKey: `${assetCode}:${issuer}`,
    network,
    fromLedger,
    toLedger,
    state: "unavailable",
    reconciled: false,
    operations: [],
    supplySeries: [],
    checkpoints: [],
    unreconciled: [],
    networkSupplyStroops: null,
    reconstructedSupplyStroops: "0",
    historyTruncated: false,
    oldestLedger: null,
    coverageNotice: `${coverageNotice("unavailable", false, null, false)} ${reason}`,
    readOnly: true,
  };
}

function toLedgerOp(entry: ReturnType<typeof applyRunningSupply>[number]): LedgerOperation {
  return {
    id: entry.id,
    ledger: entry.ledger,
    type: entry.type,
    kind: entry.kind,
    amountStroops: entry.deltaStroops.toString(),
    runningSupplyStroops: entry.runningSupplyStroops.toString(),
    from: entry.from,
    to: entry.to,
    transactionHash: entry.transactionHash,
    createdAt: entry.createdAt,
  };
}

function toCheckpoint(row: ReturnType<typeof evaluateCheckpoints>[number]): SupplyCheckpoint {
  return {
    ledger: row.ledger,
    reconstructedStroops: row.reconstructedStroops.toString(),
    networkStroops: row.networkStroops?.toString() ?? null,
    deltaStroops: row.deltaStroops?.toString() ?? null,
    reconciled: row.reconciled,
  };
}

/**
 * Rebuild outstanding supply from issuer mint/burn operations and compare with network supply checkpoints.
 * Missing or truncated history is partial and is never reported as reconciled.
 */
export async function reconcileIssuance(input: unknown, deps: IssuanceDeps = productionDeps): Promise<IssuanceReport> {
  const parsed = issuanceRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new IssuanceLedgerError("invalid_request", "The issuance ledger request is invalid.", parsed.error.flatten());
  }
  const { assetCode, issuer, network, fromLedger, toLedger } = parsed.data;
  const history = await deps.readHistory(network, assetCode, issuer, fromLedger, toLedger);
  if (history.status === "unavailable") return unavailableReport(assetCode, issuer, network, fromLedger, toLedger, history.reason);
  if (history.status === "missing") {
    throw new IssuanceLedgerError("not_found", "No issuer or asset was recorded for this id on the selected network.");
  }

  const asset = validateAssetIdentity(assetCode, issuer);
  const inWindow = (ledger: number) => ledger >= fromLedger && ledger <= toLedger;
  const seen = new Set<string>();
  const rawOps: RawIssuerOperation[] = history.value.operations.filter((op) => {
    const token = op.pagingToken || op.id;
    if (seen.has(token) || !inWindow(op.ledger)) return false;
    seen.add(token);
    return true;
  });

  const classified = classifyOperations(rawOps, asset).sort(
    (left, right) => left.ledger - right.ledger || left.id.localeCompare(right.id),
  );
  const opening = history.value.openingStroops;
  const running = applyRunningSupply(opening, classified);
  const checkpointInputs: CheckpointInput[] = history.value.checkpoints.map((row) => ({
    ledger: row.ledger,
    networkStroops: row.networkStroops,
  }));
  const evaluated = evaluateCheckpoints(running, opening, checkpointInputs);
  const unreconciled = collectUnreconciled(evaluated, running);
  const missingNetwork = evaluated.some((row) => row.networkStroops === null) || history.value.networkSupplyStroops === null;
  const reasons: string[] = [];
  if (history.value.truncated) reasons.push("Operation history was truncated.");
  if (missingNetwork) reasons.push("A network supply figure was not available at every checkpoint.");
  const reconciled = claimReconciled(evaluated, reasons.length > 0, missingNetwork);
  const state: IssuanceLedgerState = reasons.length > 0 ? "partial" : "complete";
  const reconstructed = finalSupply(opening, classified);

  return {
    schemaVersion: ISSUANCE_SCHEMA_VERSION,
    assetCode: asset.code,
    issuer: asset.issuer,
    assetKey: assetKey(asset),
    network,
    fromLedger,
    toLedger,
    state,
    reconciled,
    operations: running.map(toLedgerOp),
    supplySeries: running.map((entry) => ({
      ledger: entry.ledger,
      supplyStroops: entry.runningSupplyStroops.toString(),
    })),
    checkpoints: evaluated.map(toCheckpoint),
    unreconciled,
    networkSupplyStroops: history.value.networkSupplyStroops?.toString() ?? null,
    reconstructedSupplyStroops: reconstructed.toString(),
    historyTruncated: history.value.truncated,
    oldestLedger: history.value.oldestLedger,
    coverageNotice: coverageNotice(state, reconciled, history.value.oldestLedger, history.value.truncated),
    readOnly: true,
  };
}
