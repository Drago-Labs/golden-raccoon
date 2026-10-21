import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { FieldComparison as FieldComparisonModel, FieldSide } from "@/server/research/rpc-consistency/schema";

const TONES = {
  matched: "success",
  lagging: "warning",
  conflicting: "danger",
  single_source: "neutral",
} as const;

const LABELS = {
  matched: "Matched",
  lagging: "Lag",
  conflicting: "Conflict",
  single_source: "Single source",
} as const;

function formatRaw(value: unknown): string {
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2) ?? "null";
  } catch {
    return String(value);
  }
}

function sideText(side: FieldSide | null, name: string): string {
  if (!side) return `${name} has no answer`;

  const ledger = side.ledger == null ? "ledger not recorded" : `ledger ${side.ledger}`;

  return `${side.value} at ${ledger}`;
}

/** One row per field. A conflict prints both raw values; lag never does. */
export function FieldComparison({ fields }: { fields: FieldComparisonModel[] }) {
  if (fields.length === 0) {
    return <p className="text-sm text-white/60">No comparable field was returned.</p>;
  }

  return (
    <div data-testid="field-comparison" className="min-w-0">
      <ul className="flex flex-col gap-3">
        {fields.map((field) => (
          <li key={field.fieldId} data-testid={`field-${field.fieldId}`} className="rounded-2xl border border-white/10 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-all text-sm font-semibold">{field.label}</h3>
              <StatusBadge tone={TONES[field.classification]}>{LABELS[field.classification]}</StatusBadge>
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-xs uppercase tracking-[0.12em] text-white/45">Horizon</dt>
                <dd className="break-all">{sideText(field.horizon, "Horizon")}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs uppercase tracking-[0.12em] text-white/45">Stellar RPC</dt>
                <dd className="break-all">{sideText(field.rpc, "Stellar RPC")}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs leading-5 text-white/60">{field.note}</p>
            {field.conflict ? (
              <div data-testid={`conflict-${field.fieldId}`} className="mt-3 grid grid-cols-1 gap-3">
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">Horizon raw value</h4>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-black/30 p-3 text-xs">{formatRaw(field.conflict.horizonRaw)}</pre>
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">Stellar RPC raw value</h4>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-black/30 p-3 text-xs">{formatRaw(field.conflict.rpcRaw)}</pre>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
