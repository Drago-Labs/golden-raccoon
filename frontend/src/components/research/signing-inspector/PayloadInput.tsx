"use client";

import { useId, useState } from "react";

type PayloadKind = "evm_calldata" | "evm_typed_data" | "stellar_envelope";

const STELLAR_NETWORKS = [
  { label: "Public network", passphrase: "Public Global Stellar Network ; September 2015" },
  { label: "Testnet", passphrase: "Test SDF Network ; September 2015" },
];

const KIND_LABELS: Array<{ id: PayloadKind; label: string; hint: string }> = [
  { id: "evm_calldata", label: "EVM calldata", hint: "Hex calldata, starting with 0x." },
  { id: "evm_typed_data", label: "EIP-712 typed data", hint: "The JSON document your wallet would show you." },
  { id: "stellar_envelope", label: "Stellar envelope", hint: "A base64 transaction envelope (XDR)." },
];

/**
 * The unsigned payload a user wants to look at before opening their wallet.
 *
 * The payload is typed or pasted here and travels no further than the request
 * that decodes it. Nothing is stored, and the form never asks for a private
 * key, a seed phrase or a signature — there is no field that could accept one.
 */
export type PayloadSubmission = {
  kind: PayloadKind;
  payload: string;
  expectedAccount: string;
  expectedChainId: string;
  expectedContract: string;
  expectedStellarNetwork: string;
};

export function PayloadInput({ busy, onSubmit }: { busy: boolean; onSubmit: (request: PayloadSubmission) => void }) {
  const kindId = useId();
  const payloadId = useId();
  const accountId = useId();
  const chainId = useId();
  const contractId = useId();
  const stellarNetworkId = useId();
  const errorId = useId();

  const [kind, setKind] = useState<PayloadKind>("evm_calldata");
  const [payload, setPayload] = useState("");
  const [expectedAccount, setExpectedAccount] = useState("");
  const [expectedChainId, setExpectedChainId] = useState("1");
  const [expectedContract, setExpectedContract] = useState("");
  const [expectedStellarNetwork, setExpectedStellarNetwork] = useState(STELLAR_NETWORKS[0].passphrase);
  const [error, setError] = useState<string | null>(null);
  const isStellar = kind === "stellar_envelope";

  const active = KIND_LABELS.find((entry) => entry.id === kind) as (typeof KIND_LABELS)[number];

  return (
    <form
      aria-label="Signing payload"
      className="glass-panel flex flex-col gap-4 rounded-[28px] p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();

        if (payload.trim().length === 0) {
          setError("Paste the unsigned payload you want to inspect.");
          return;
        }

        setError(null);
        onSubmit({
          kind,
          payload: payload.trim(),
          expectedAccount: expectedAccount.trim(),
          expectedChainId: isStellar ? "" : expectedChainId.trim(),
          expectedContract: isStellar ? "" : expectedContract.trim(),
          expectedStellarNetwork: isStellar ? expectedStellarNetwork : "",
        });
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5 sm:w-64">
          <label htmlFor={kindId} className="text-xs font-medium uppercase tracking-[0.14em] text-white/54">
            Payload kind
          </label>
          <select
            id={kindId}
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as PayloadKind)}
            className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/40"
          >
            {KIND_LABELS.map((entry) => (
              <option key={entry.id} value={entry.id} className="bg-[#151515]">
                {entry.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={accountId} className="text-xs font-medium uppercase tracking-[0.14em] text-white/54">
            Account you expect (optional)
          </label>
          <input
            id={accountId}
            name="expectedAccount"
            value={expectedAccount}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setExpectedAccount(event.target.value)}
            placeholder="0x… or G…"
            className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-2.5 font-mono text-sm text-white outline-none focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/40"
          />
        </div>
      </div>

      {/*
        The context the user expects. A payload is only safe *relative to* an
        intention, so the comparison needs both halves — without these fields
        the report could say what a payload does but never that it does it
        somewhere the user did not mean.
      */}
      <fieldset className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <legend className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-white/54">Context you expect</legend>

        {isStellar ? (
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor={stellarNetworkId} className="text-xs text-white/54">
              Stellar network
            </label>
            <select
              id={stellarNetworkId}
              name="expectedStellarNetwork"
              value={expectedStellarNetwork}
              onChange={(event) => setExpectedStellarNetwork(event.target.value)}
              className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/40"
            >
              {STELLAR_NETWORKS.map((option) => (
                <option key={option.passphrase} value={option.passphrase} className="bg-[#151515]">
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5 sm:w-40">
              <label htmlFor={chainId} className="text-xs text-white/54">
                Chain id
              </label>
              <input
                id={chainId}
                name="expectedChainId"
                inputMode="numeric"
                value={expectedChainId}
                autoComplete="off"
                onChange={(event) => setExpectedChainId(event.target.value)}
                className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-2.5 font-mono text-sm text-white outline-none focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/40"
              />
            </div>

            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor={contractId} className="text-xs text-white/54">
                Contract
              </label>
              <input
                id={contractId}
                name="expectedContract"
                value={expectedContract}
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => setExpectedContract(event.target.value)}
                placeholder="0x…"
                className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-2.5 font-mono text-sm text-white outline-none focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/40"
              />
            </div>
          </>
        )}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={payloadId} className="text-xs font-medium uppercase tracking-[0.14em] text-white/54">
          Unsigned payload
        </label>
        <textarea
          id={payloadId}
          name="payload"
          value={payload}
          rows={6}
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : `${payloadId}-hint`}
          onChange={(event) => setPayload(event.target.value)}
          placeholder={active.hint}
          className="w-full resize-y rounded-2xl border border-white/12 bg-white/5 px-4 py-3 font-mono text-xs leading-5 text-white outline-none focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/40"
        />
        <p id={`${payloadId}-hint`} className="text-xs text-white/42">
          {active.hint} Never paste a private key or seed phrase — this tool does not need one and cannot use one.
        </p>
      </div>

      {error ? (
        <p id={errorId} role="alert" className="text-xs text-red-200">
          {error}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-2xl border border-white/14 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/16 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50"
        >
          {busy ? "Decoding…" : "Decode"}
        </button>
      </div>
    </form>
  );
}
