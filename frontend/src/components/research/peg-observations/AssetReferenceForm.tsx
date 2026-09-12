"use client";

import { useId, useState } from "react";

export type DeclarationDraft = {
  chainId: string;
  symbol: string;
  issuer: string;
  referenceCurrency: string;
  targetValue: string;
  provenance: "issuer_disclosure" | "prospectus" | "operator_declared" | "protocol_documentation";
};

/**
 * Peg declaration form.
 *
 * Reference currency, target value and provenance are all required, with no
 * defaults offered: the whole point of the feature is that these are stated
 * rather than assumed, and pre-filling "USD" and "1.00" would quietly undo it.
 */
export function AssetReferenceForm({
  busy,
  onDeclare,
}: {
  busy: boolean;
  onDeclare: (draft: DeclarationDraft) => void;
}) {
  const chainFieldId = useId();
  const symbolFieldId = useId();
  const issuerFieldId = useId();
  const currencyFieldId = useId();
  const targetFieldId = useId();
  const provenanceFieldId = useId();
  const errorId = useId();

  const [draft, setDraft] = useState<DeclarationDraft>({
    chainId: "",
    symbol: "",
    issuer: "",
    referenceCurrency: "",
    targetValue: "",
    provenance: "issuer_disclosure",
  });
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft.chainId.trim() || !draft.symbol.trim()) {
      setError("Network and symbol are both required to identify the asset.");
      return;
    }

    if (!draft.referenceCurrency.trim()) {
      setError("A reference currency is required. This feature does not assume US dollars.");
      return;
    }

    if (!/^\d+(\.\d+)?$/.test(draft.targetValue.trim())) {
      setError("A target value is required, as a non-negative decimal. It is not assumed to be 1.");
      return;
    }

    setError(null);
    onDeclare(draft);
  }

  return (
    <form onSubmit={submit} className="space-y-3" aria-describedby={error ? errorId : undefined}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor={chainFieldId} className="block text-xs text-subtle">Network</label>
          <input
            id={chainFieldId}
            value={draft.chainId}
            onChange={(event) => setDraft((current) => ({ ...current, chainId: event.target.value }))}
            placeholder="stellar-pubnet"
            className="mt-1 w-full rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor={symbolFieldId} className="block text-xs text-subtle">Symbol</label>
          <input
            id={symbolFieldId}
            value={draft.symbol}
            onChange={(event) => setDraft((current) => ({ ...current, symbol: event.target.value }))}
            placeholder="EURC"
            className="mt-1 w-full rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor={issuerFieldId} className="block text-xs text-subtle">Issuer or contract (optional)</label>
          <input
            id={issuerFieldId}
            value={draft.issuer}
            onChange={(event) => setDraft((current) => ({ ...current, issuer: event.target.value }))}
            className="mt-1 w-full rounded-lg border border-white/15 bg-transparent px-3 py-2 font-mono text-xs"
          />
        </div>
        <div>
          <label htmlFor={currencyFieldId} className="block text-xs text-subtle">Reference currency</label>
          <input
            id={currencyFieldId}
            value={draft.referenceCurrency}
            onChange={(event) => setDraft((current) => ({ ...current, referenceCurrency: event.target.value }))}
            placeholder="EUR"
            className="mt-1 w-full rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor={targetFieldId} className="block text-xs text-subtle">Target value per unit</label>
          <input
            id={targetFieldId}
            value={draft.targetValue}
            onChange={(event) => setDraft((current) => ({ ...current, targetValue: event.target.value }))}
            placeholder="0.83"
            inputMode="decimal"
            className="mt-1 w-full rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm tabular-nums"
          />
        </div>
        <div>
          <label htmlFor={provenanceFieldId} className="block text-xs text-subtle">Where this target comes from</label>
          <select
            id={provenanceFieldId}
            value={draft.provenance}
            onChange={(event) =>
              setDraft((current) => ({ ...current, provenance: event.target.value as DeclarationDraft["provenance"] }))
            }
            className="mt-1 w-full rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm"
          >
            <option value="issuer_disclosure">Issuer disclosure</option>
            <option value="prospectus">Prospectus</option>
            <option value="protocol_documentation">Protocol documentation</option>
            <option value="operator_declared">Operator declared</option>
          </select>
        </div>
      </div>

      {error ? (
        <p id={errorId} role="alert" className="text-xs text-red-200">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex h-11 items-center rounded-full border border-[var(--color-border-strong)] px-5 text-sm font-semibold transition hover:bg-white/5 disabled:opacity-50"
      >
        {busy ? "Analysing…" : "Declare peg and analyse"}
      </button>
      <p className="text-xs text-subtle">
        A stable-sounding symbol is not a declaration. An asset with no declared peg is listed as undefined rather than
        measured against an assumed one-dollar target.
      </p>
    </form>
  );
}
