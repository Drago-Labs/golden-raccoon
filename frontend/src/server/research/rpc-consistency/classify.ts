/**
 * Classify one field.
 *
 * Same ledger and same canonical value: matched.
 * Same ledger and different value: conflict, and both raw values are kept.
 * Different ledgers: lag, even when the values also differ.
 * One side only: single-source, with the missing provider named.
 */
import { alignLedgers } from "./ledgerAlignment";
import type { FieldComparison, FieldSide, NormalizedField } from "./schema";

export type ClassifyContext = {
  horizonAvailable: boolean;
  rpcAvailable: boolean;
};

function hasValue(side: FieldSide | null): side is FieldSide {
  return side != null && side.value != null;
}

function singleSourceNote(present: "horizon" | "rpc", context: ClassifyContext): string {
  if (present === "rpc" && !context.horizonAvailable) {
    return "Horizon is unavailable. This is a single-source result from Stellar RPC.";
  }

  if (present === "horizon" && !context.rpcAvailable) {
    return "Stellar RPC is unavailable. This is a single-source result from Horizon.";
  }

  if (present === "rpc") {
    return "Horizon has no answer for this field. This is a single-source result from Stellar RPC.";
  }

  return "Stellar RPC has no answer for this field. This is a single-source result from Horizon.";
}

export function classifyField(field: NormalizedField, context: ClassifyContext): FieldComparison {
  const horizon = hasValue(field.horizon) ? field.horizon : null;
  const rpc = hasValue(field.rpc) ? field.rpc : null;
  const base = {
    fieldId: field.fieldId,
    kind: field.kind,
    label: field.label,
    horizon,
    rpc,
    conflict: null,
  };

  if (horizon && !rpc) {
    return {
      ...base,
      classification: "single_source",
      note: singleSourceNote("horizon", context),
    };
  }

  if (rpc && !horizon) {
    return {
      ...base,
      classification: "single_source",
      note: singleSourceNote("rpc", context),
    };
  }

  if (!horizon || !rpc) {
    return {
      ...base,
      classification: "single_source",
      note: "Neither provider returned a comparable value for this field.",
    };
  }

  const aligned = alignLedgers(horizon.ledger, rpc.ledger);

  if (aligned.relation !== "same") {
    const why =
      aligned.relation === "lag"
        ? `Horizon answered at ledger ${horizon.ledger} and Stellar RPC at ledger ${rpc.ledger}.`
        : "At least one answer has no ledger, so the values cannot be treated as the same moment.";

    return {
      ...base,
      classification: "lagging",
      note: `${why} Different ledgers are lag, not a conflict.`,
    };
  }

  if (horizon.value !== rpc.value) {
    return {
      ...base,
      classification: "conflicting",
      conflict: { horizonRaw: horizon.raw, rpcRaw: rpc.raw },
      note: `Both providers answered at ledger ${horizon.ledger} and the values differ.`,
    };
  }

  return {
    ...base,
    classification: "matched",
    note: `Both providers report the same value at ledger ${horizon.ledger}.`,
  };
}

export function classifyFields(fields: NormalizedField[], context: ClassifyContext): FieldComparison[] {
  return fields.map((field) => classifyField(field, context));
}
