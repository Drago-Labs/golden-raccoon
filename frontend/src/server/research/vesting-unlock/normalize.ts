/**
 * Expand raw vesting schedules into dated unlock tranches.
 *
 * Cancelled and superseded revisions emit cancelled tranches so the evidence
 * trail remains, but those amounts are never mixed into future-unlock totals.
 */
import { VESTING_LIMITS, type RawVestingSchedule, type TrancheState, type UnlockTranche } from "./schema";
import { toEpochMs } from "./time";
import { parseAmount, splitExact } from "./unitMath";

function classifyState(options: {
  unlockAtMs: number;
  asOfMs: number;
  cancelled: boolean;
  released?: boolean;
  claimable?: boolean;
  hasClaimableRemainder?: boolean;
}): TrancheState {
  if (options.cancelled) return "cancelled";
  if (options.released) return "released";
  if (options.claimable) return "claimable";
  if (options.unlockAtMs > options.asOfMs) return "scheduled";
  if (options.hasClaimableRemainder) return "claimable";
  return "released";
}

function trancheId(scheduleId: string, revision: number, index: number): string {
  return `${scheduleId}:r${revision}:t${index}`;
}

function expandLinear(schedule: RawVestingSchedule, asOfMs: number): UnlockTranche[] {
  if (schedule.plan.kind !== "linear") return [];

  const plan = schedule.plan;
  const startMs = toEpochMs(plan.startAt);
  const endMs = toEpochMs(plan.endAt);
  const cliffMs = toEpochMs(plan.cliffAt ?? null);
  const total = parseAmount(plan.amountBaseUnits);

  if (startMs === null || endMs === null || total === null || endMs <= startMs) {
    return [
      {
        trancheId: trancheId(schedule.scheduleId, schedule.revision, 0),
        scheduleId: schedule.scheduleId,
        revision: schedule.revision,
        asset: schedule.asset,
        beneficiary: schedule.beneficiary,
        amountBaseUnits: plan.amountBaseUnits,
        unlockAt: plan.endAt,
        unlockLedger: plan.endLedger ?? null,
        state: "unknown",
        sourceType: schedule.sourceType,
        supersededBy: schedule.supersededBy ?? null,
        provenance: schedule.provenance,
        evidenceUrl: schedule.evidenceUrl ?? null,
        unknownReason: "Linear plan bounds or amount could not be read.",
      },
    ];
  }

  const streamStart = cliffMs !== null && cliffMs > startMs ? cliffMs : startMs;
  const duration = endMs - streamStart;
  const segmentCount = Math.min(
    VESTING_LIMITS.maxLinearSegments,
    Math.max(1, Math.ceil(duration / (30 * 86_400_000))),
  );
  const parts = splitExact(plan.amountBaseUnits, segmentCount);
  const cancelled = Boolean(schedule.cancelled);
  const hasClaimable = Boolean(schedule.claimableBaseUnits && parseAmount(schedule.claimableBaseUnits) !== null && parseAmount(schedule.claimableBaseUnits)! > 0n);

  return parts.map((amount, index) => {
    const unlockAtMs =
      segmentCount === 1
        ? endMs
        : streamStart + Math.floor(((index + 1) * duration) / segmentCount);
    const unlockAt = new Date(unlockAtMs).toISOString();

    return {
      trancheId: trancheId(schedule.scheduleId, schedule.revision, index),
      scheduleId: schedule.scheduleId,
      revision: schedule.revision,
      asset: schedule.asset,
      beneficiary: schedule.beneficiary,
      amountBaseUnits: amount,
      unlockAt,
      unlockLedger: index === parts.length - 1 ? (plan.endLedger ?? null) : null,
      state: classifyState({
        unlockAtMs,
        asOfMs,
        cancelled,
        hasClaimableRemainder: hasClaimable && unlockAtMs <= asOfMs,
      }),
      sourceType: schedule.sourceType,
      supersededBy: schedule.supersededBy ?? null,
      provenance: schedule.provenance,
      evidenceUrl: schedule.evidenceUrl ?? null,
      unknownReason: null,
    };
  });
}

export function expandSchedule(schedule: RawVestingSchedule, asOfMs: number): UnlockTranche[] {
  if (!schedule.supported) return [];

  if (schedule.beneficiary === null) {
    // Still expand amounts for evidence, but mark unknown so totals treat them as gaps.
    const expanded = expandSupported(schedule, asOfMs);

    return expanded.map((tranche) => ({
      ...tranche,
      state: tranche.state === "cancelled" ? "cancelled" : "unknown",
      unknownReason: tranche.unknownReason ?? "Beneficiary is not named in the evidence.",
    }));
  }

  return expandSupported(schedule, asOfMs);
}

function expandSupported(schedule: RawVestingSchedule, asOfMs: number): UnlockTranche[] {
  const cancelled = Boolean(schedule.cancelled);

  if (schedule.plan.kind === "cliff") {
    const unlockAtMs = toEpochMs(schedule.plan.cliffAt);

    if (unlockAtMs === null || parseAmount(schedule.plan.amountBaseUnits) === null) {
      return [
        {
          trancheId: trancheId(schedule.scheduleId, schedule.revision, 0),
          scheduleId: schedule.scheduleId,
          revision: schedule.revision,
          asset: schedule.asset,
          beneficiary: schedule.beneficiary,
          amountBaseUnits: schedule.plan.amountBaseUnits,
          unlockAt: schedule.plan.cliffAt,
          unlockLedger: schedule.plan.cliffLedger ?? null,
          state: "unknown",
          sourceType: schedule.sourceType,
          supersededBy: schedule.supersededBy ?? null,
          provenance: schedule.provenance,
          evidenceUrl: schedule.evidenceUrl ?? null,
          unknownReason: "Cliff unlock time or amount could not be read.",
        },
      ];
    }

    return [
      {
        trancheId: trancheId(schedule.scheduleId, schedule.revision, 0),
        scheduleId: schedule.scheduleId,
        revision: schedule.revision,
        asset: schedule.asset,
        beneficiary: schedule.beneficiary,
        amountBaseUnits: schedule.plan.amountBaseUnits,
        unlockAt: schedule.plan.cliffAt,
        unlockLedger: schedule.plan.cliffLedger ?? null,
        state: classifyState({ unlockAtMs, asOfMs, cancelled }),
        sourceType: schedule.sourceType,
        supersededBy: schedule.supersededBy ?? null,
        provenance: schedule.provenance,
        evidenceUrl: schedule.evidenceUrl ?? null,
        unknownReason: null,
      },
    ];
  }

  if (schedule.plan.kind === "linear") {
    return expandLinear(schedule, asOfMs);
  }

  return schedule.plan.tranches.map((entry, index) => {
    const unlockAtMs = toEpochMs(entry.unlockAt);

    if (unlockAtMs === null || parseAmount(entry.amountBaseUnits) === null) {
      return {
        trancheId: trancheId(schedule.scheduleId, schedule.revision, index),
        scheduleId: schedule.scheduleId,
        revision: schedule.revision,
        asset: schedule.asset,
        beneficiary: schedule.beneficiary,
        amountBaseUnits: entry.amountBaseUnits,
        unlockAt: entry.unlockAt,
        unlockLedger: entry.unlockLedger ?? null,
        state: "unknown" as const,
        sourceType: schedule.sourceType,
        supersededBy: schedule.supersededBy ?? null,
        provenance: schedule.provenance,
        evidenceUrl: schedule.evidenceUrl ?? null,
        unknownReason: "Fixed tranche unlock time or amount could not be read.",
      };
    }

    return {
      trancheId: trancheId(schedule.scheduleId, schedule.revision, index),
      scheduleId: schedule.scheduleId,
      revision: schedule.revision,
      asset: schedule.asset,
      beneficiary: schedule.beneficiary,
      amountBaseUnits: entry.amountBaseUnits,
      unlockAt: entry.unlockAt,
      unlockLedger: entry.unlockLedger ?? null,
      state: classifyState({
        unlockAtMs,
        asOfMs,
        cancelled,
        released: entry.released,
        claimable: entry.claimable,
      }),
      sourceType: schedule.sourceType,
      supersededBy: schedule.supersededBy ?? null,
      provenance: schedule.provenance,
      evidenceUrl: schedule.evidenceUrl ?? null,
      unknownReason: null,
    };
  });
}

/**
 * Keeps the highest revision per schedule lineage and marks lower revisions
 * cancelled so amended plans never double-count future unlocks.
 */
export function applyRevisions(tranches: UnlockTranche[]): UnlockTranche[] {
  const latestBySchedule = new Map<string, number>();

  for (const tranche of tranches) {
    const current = latestBySchedule.get(tranche.scheduleId) ?? -1;

    if (tranche.revision > current) latestBySchedule.set(tranche.scheduleId, tranche.revision);
  }

  return tranches.map((tranche) => {
    const latest = latestBySchedule.get(tranche.scheduleId) ?? tranche.revision;

    if (tranche.revision < latest && tranche.state !== "cancelled") {
      return {
        ...tranche,
        state: "cancelled",
        supersededBy: `${tranche.scheduleId}:r${latest}`,
        unknownReason: null,
      };
    }

    return tranche;
  });
}
