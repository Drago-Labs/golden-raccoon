/**
 * Public entry for the read-only vesting and unlock workbench.
 *
 * `analyseVestingUnlocks` takes sources and a reader as data. It returns a
 * report and touches nothing: no claim, no schedule transaction, no holder-risk
 * score rewrite. The `VestingReader` port exposes one read method only.
 */
import { buildCoverage, buildTimeline } from "./coverage";
import { applyRevisions, expandSchedule } from "./normalize";
import { isObservationStale, toEpochMs } from "./time";
import {
  VESTING_LIMITS,
  VESTING_SCHEMA_VERSION,
  VestingUnlockError,
  vestingUnlockRequestSchema,
  type EvidenceGap,
  type UnlockTranche,
  type VestingObservation,
  type VestingReader,
  type VestingUnlockReport,
} from "./schema";

function budgeted(reader: VestingReader, budget: number): { reader: VestingReader; used: () => number } {
  let used = 0;

  return {
    reader: {
      async readSource(input) {
        if (used >= budget) {
          throw new VestingUnlockError(
            "read_budget_exceeded",
            `The analysis reached its published ceiling of ${budget} reads.`,
          );
        }

        used += 1;
        return reader.readSource(input);
      },
    },
    used: () => used,
  };
}

export async function analyseVestingUnlocks(
  input: unknown,
  reader: VestingReader,
): Promise<VestingUnlockReport> {
  const parsed = vestingUnlockRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new VestingUnlockError("invalid_request", "The vesting unlock request could not be read.", parsed.error.flatten());
  }

  const request = parsed.data;
  const budget = budgeted(reader, VESTING_LIMITS.maxReads);
  const warnings: string[] = [];
  const gaps: EvidenceGap[] = [];
  const rawTranches: UnlockTranche[] = [];
  let observation: VestingObservation | null = null;

  for (const source of request.sources) {
    try {
      const result = await budget.reader.readSource(source);

      if (!observation) observation = result.observation;
      gaps.push(...result.gaps);

      for (const schedule of result.schedules) {
        if (!schedule.supported) {
          gaps.push({
            kind: "unsupported_contract",
            sourceId: source.id,
            detail: schedule.unsupportedReason ?? "Contract or schedule shape is not in the supported set.",
          });
          continue;
        }

        if (schedule.beneficiary === null) {
          gaps.push({
            kind: "unknown_beneficiary",
            sourceId: schedule.scheduleId,
            detail: "The schedule does not name a beneficiary; unlock amounts remain an evidence gap.",
          });
        }

        if (request.beneficiary && schedule.beneficiary && schedule.beneficiary !== request.beneficiary) {
          continue;
        }

        const asOfMs =
          toEpochMs(request.asOf ?? result.observation.closeTime ?? result.observation.observedAt) ?? Date.now();

        rawTranches.push(...expandSchedule(schedule, asOfMs));
      }
    } catch (error) {
      if (error instanceof VestingUnlockError && error.code === "read_budget_exceeded") {
        warnings.push(error.message);
        break;
      }

      gaps.push({
        kind: "other",
        sourceId: source.id,
        detail: error instanceof Error ? error.message : "Source read failed.",
      });
    }
  }

  const tranches = applyRevisions(rawTranches).slice(0, VESTING_LIMITS.maxTranches);

  if (rawTranches.length > VESTING_LIMITS.maxTranches) {
    warnings.push(`Tranche list truncated to the published limit of ${VESTING_LIMITS.maxTranches}.`);
  }

  const asOf =
    request.asOf ??
    observation?.closeTime ??
    observation?.observedAt ??
    new Date().toISOString();

  const staleObservation = observation
    ? isObservationStale({
        closeTime: observation.closeTime,
        observedAt: observation.observedAt,
        maxAgeSeconds: request.maxObservationAgeSeconds,
      })
    : false;

  if (staleObservation) {
    gaps.push({
      kind: "stale_ledger",
      sourceId: observation?.source ?? request.network,
      detail: `Observation ledger close is older than the freshness bound of ${request.maxObservationAgeSeconds} seconds.`,
    });
    warnings.push("Observation ledger is stale; unlock states may lag the chain.");
  }

  const coverage = buildCoverage({
    sourceCount: request.sources.length,
    tranches,
    gaps,
    readsUsed: budget.used(),
    readBudget: VESTING_LIMITS.maxReads,
    staleObservation,
  });

  return {
    schemaVersion: VESTING_SCHEMA_VERSION,
    network: request.network,
    chainFamily: request.chainFamily,
    asOf,
    displayTimeZone: request.displayTimeZone,
    observation: {
      ledger: observation?.ledger ?? null,
      closeTime: observation?.closeTime ?? null,
      source: observation?.source ?? null,
      stale: staleObservation,
    },
    tranches,
    timeline: buildTimeline(tranches),
    gaps,
    coverage,
    warnings,
    readOnly: true,
    claimAndScheduleUnchanged: true,
  };
}

export { VestingUnlockError } from "./schema";
export type { VestingUnlockReport, VestingReader } from "./schema";
