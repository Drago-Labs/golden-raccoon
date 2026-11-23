import { rebuildBalances } from "./balanceHistory";
import { categorizeOutflows } from "./categorization";
import { buildCoverage } from "./coverage";
import { TreasuryError, type WorkState } from "./errors";
import { readOutflows } from "./outflowReader";
import { parseProjectId } from "./projectInput";
import { compareReported } from "./reportedFigures";
import type { Checkpoint, ReportedFigure, TreasuryReport } from "./schema";
import { readTreasuryAddresses } from "./treasuryRegistry";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
function readCheckpoints(value: unknown): Checkpoint[] {
  if (!Array.isArray(value)) return [];
  const rows: Checkpoint[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.time !== "number" || typeof row.asset !== "string" || typeof row.chain !== "string" || typeof row.amount !== "string") continue;
    rows.push({ time: row.time, asset: row.asset, chain: row.chain, amount: row.amount });
  }
  return rows;
}
function readFigures(value: unknown): ReportedFigure[] {
  if (!Array.isArray(value)) return [];
  const rows: ReportedFigure[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.asset !== "string" || typeof row.chain !== "string" || typeof row.reported !== "string" || typeof row.source !== "string") continue;
    rows.push({ asset: row.asset, chain: row.chain, reported: row.reported, source: row.source });
  }
  return rows;
}
export function analyseTreasury(value: unknown): WorkState<TreasuryReport> {
  const body = asRecord(value);
  if (!body) return { kind: "unknown_format", reason: "The treasury payload is not an object." };
  if (body.unavailable === true) return { kind: "unavailable", reason: typeof body.reason === "string" ? body.reason : "The treasury provider did not answer." };
  try {
    const projectId = parseProjectId(body.projectId);
    const addresses = readTreasuryAddresses(body.addresses);
    const balances = rebuildBalances(readCheckpoints(body.checkpoints));
    const outflows = categorizeOutflows(readOutflows(body.outflows));
    return {
      kind: "ready",
      report: { projectId, balances, outflows, comparisons: compareReported(readFigures(body.reported), balances), coverage: buildCoverage(addresses) },
    };
  } catch (error) {
    if (error instanceof TreasuryError) return { kind: "unknown_format", reason: error.message };
    return { kind: "unknown_format", reason: "The treasury payload could not be read." };
  }
}
