"use client";

import { useCallback, useRef, useState } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { StatusBadge } from "@/components/a11y/StatusBadge";
import { OperationList } from "./OperationList";
import { PayloadInput, type PayloadSubmission } from "./PayloadInput";
import { PermissionSummary } from "./PermissionSummary";
import { UnknownFieldsPanel } from "./UnknownFieldsPanel";
import type { ContextBinding, SigningReport } from "@/server/research/signing-inspector/schema";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: SigningReport }
  | { status: "error"; code: string; message: string };

const BINDING_LABELS: Record<ContextBinding["field"], string> = {
  account: "Account",
  evm_chain_id: "Chain",
  verifying_contract: "Contract",
  stellar_network: "Stellar network",
  domain_name: "Domain name",
};

const BINDING_TONES: Record<ContextBinding["state"], "success" | "warning" | "danger" | "neutral"> = {
  match: "success",
  mismatch: "danger",
  not_bound: "warning",
  not_checked: "neutral",
};

const BINDING_STATE_LABELS: Record<ContextBinding["state"], string> = {
  match: "Matches",
  mismatch: "Mismatch",
  not_bound: "Not bound",
  not_checked: "Not checked",
};

/**
 * Offline signing payload and permission workspace.
 *
 * The session is keyed by account and network, so switching either remounts
 * this component and drops the decoded payload with it. Nothing is persisted:
 * a payload lives in this component's state and in the request that decoded
 * it, and nowhere else.
 */
export function SigningInspector(props: { account?: string | null; network?: string | null; endpoint?: string }) {
  const sessionKey = `${(props.account ?? "anonymous").toLowerCase()}|${props.network ?? "unknown"}`;

  return (
    <InspectorSession
      key={sessionKey}
      defaultAccount={props.account ?? ""}
      endpoint={props.endpoint ?? "/api/insights/signing-inspector"}
    />
  );
}

function InspectorSession({ defaultAccount, endpoint }: { defaultAccount: string; endpoint: string }) {
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const generation = useRef(0);

  const decode = useCallback(
    (input: PayloadSubmission) => {
      generation.current += 1;
      const requestGeneration = generation.current;

      const expectedAccount = input.expectedAccount || defaultAccount;
      const chainId = Number.parseInt(input.expectedChainId, 10);

      const expected = {
        ...(expectedAccount ? { account: expectedAccount } : {}),
        ...(Number.isSafeInteger(chainId) && chainId > 0 ? { evmChainId: chainId } : {}),
        ...(/^0x[0-9a-fA-F]{40}$/.test(input.expectedContract) ? { verifyingContract: input.expectedContract } : {}),
        ...(input.expectedStellarNetwork ? { stellarNetworkPassphrase: input.expectedStellarNetwork } : {}),
      };

      let payload: unknown;

      if (input.kind === "evm_calldata") {
        payload = { kind: "evm_calldata", data: input.payload, ...(expected.evmChainId ? { chainId: expected.evmChainId } : {}) };
      } else if (input.kind === "stellar_envelope") {
        // The chosen network is sent as the *expectation* only, never as a
        // declaration on the payload. An envelope carries no network, and
        // echoing the user's own choice back as if the payload had declared it
        // would turn a vacuous comparison into a reassuring green row.
        payload = { kind: "stellar_envelope", xdr: input.payload };
      } else {
        try {
          payload = { kind: "evm_typed_data", typedData: JSON.parse(input.payload) };
        } catch {
          setState({ status: "error", code: "invalid_json", message: "The typed data is not valid JSON." });
          return;
        }
      }

      setState({ status: "loading" });

      fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ evaluatedAt: new Date().toISOString(), expected, payload }),
      })
        .then(async (response) => {
          const body = await response.json();

          // A response for an earlier payload is dropped, so a slow decode
          // cannot repaint a view the user has already replaced.
          if (requestGeneration !== generation.current) return;

          if (!response.ok) {
            setState({
              status: "error",
              code: typeof body?.error === "string" ? body.error : "signing_inspection_failed",
              message: typeof body?.message === "string" ? body.message : "The payload could not be decoded.",
            });
            return;
          }

          setState({ status: "ready", report: body.report });
        })
        .catch(() => {
          if (requestGeneration !== generation.current) return;
          setState({ status: "error", code: "network_error", message: "The decoding request could not be completed." });
        });
    },
    [defaultAccount, endpoint],
  );

  const report = state.status === "ready" ? state.report : null;
  const mismatches = report?.contextBinding.filter((entry) => entry.state === "mismatch") ?? [];

  const statusMessage =
    state.status === "loading"
      ? "Decoding the payload offline."
      : state.status === "error"
        ? `Decoding failed: ${state.message}`
        : report
          ? `Decoded. ${report.permissions.length} permission${report.permissions.length === 1 ? "" : "s"}, ${report.unknownFields.length} unrecognized field${report.unknownFields.length === 1 ? "" : "s"}, ${mismatches.length} context mismatch${mismatches.length === 1 ? "" : "es"}.`
          : "";

  return (
    <div className="flex flex-col gap-6">
      <PayloadInput busy={state.status === "loading"} onSubmit={decode} />

      <LiveRegion message={statusMessage} />

      {state.status === "idle" ? (
        <p data-testid="signing-idle" className="text-sm text-white/54">
          Paste an unsigned payload to see what it requests. Nothing is signed, submitted or stored, and no chain is contacted.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p data-testid="signing-loading" className="text-sm text-white/54">
          Decoding…
        </p>
      ) : null}

      {state.status === "error" ? (
        <div data-testid="signing-error" role="alert" className="glass-panel rounded-[28px] p-5 text-sm text-red-200">
          <p className="font-semibold">The payload could not be decoded.</p>
          <p className="mt-1 text-white/70">{state.message}</p>
          <p className="mt-2 text-xs text-white/42">Error code: {state.code}</p>
        </div>
      ) : null}

      {report ? (
        <>
          <section data-testid="signing-summary" aria-labelledby="signing-summary-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="signing-summary-heading" className="text-xl font-semibold">
                What this payload requests
              </h2>
              <StatusBadge tone={mismatches.length > 0 ? "danger" : "neutral"}>{report.coverage.state} coverage</StatusBadge>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/70">{report.summary}</p>
            <p className="mt-3 rounded-2xl border border-[#d9a441]/30 bg-[#d9a441]/8 px-4 py-3 text-xs leading-5 text-[#f2c86d]">
              Decoding is not approval. This describes what the bytes ask for. It is not a check that the recipient is honest,
              that the contract behaves as its name suggests, or that signing is a good idea.
            </p>
            <p className="mt-2 text-xs text-white/42">{report.coverage.note}</p>
          </section>

          <section data-testid="context-binding" aria-labelledby="signing-binding-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <h2 id="signing-binding-heading" className="text-lg font-semibold">
              Context binding
            </h2>
            <p className="mt-1 text-xs leading-5 text-white/42">
              Whether the payload is tied to the account, chain and contract you expect — and where it is tied to nothing at all.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                <caption className="sr-only">Expected signing context compared against the payload</caption>
                <thead>
                  <tr className="text-xs uppercase tracking-[0.12em] text-white/42">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Field
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Expected
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      In the payload
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Reading
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.contextBinding.map((entry, index) => (
                    <tr key={`${entry.field}-${index}`} className="border-t border-white/8 align-top">
                      <td className="py-3 pr-4">
                        <StatusBadge tone={BINDING_TONES[entry.state]}>{BINDING_STATE_LABELS[entry.state]}</StatusBadge>
                        <p className="mt-2 text-xs text-white/54">{BINDING_LABELS[entry.field]}</p>
                      </td>
                      <td className="py-3 pr-4 break-all font-mono text-xs text-white/70">{entry.expected ?? "—"}</td>
                      <td className="py-3 pr-4 break-all font-mono text-xs text-white/70">{entry.observed ?? "—"}</td>
                      <td className="py-3 text-xs leading-5 text-white/54">{entry.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="signing-permissions-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <h2 id="signing-permissions-heading" className="text-lg font-semibold">
              Permissions
            </h2>
            <div className="mt-4">
              <PermissionSummary permissions={report.permissions} />
            </div>
          </section>

          {report.operations.length > 0 ? (
            <section aria-labelledby="signing-operations-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
              <h2 id="signing-operations-heading" className="text-lg font-semibold">
                {report.payloadKind === "stellar_envelope" ? "Operations" : "Signed fields"}
              </h2>
              <div className="mt-4">
                <OperationList operations={report.operations} />
              </div>
            </section>
          ) : null}

          <section aria-labelledby="signing-unknown-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <h2 id="signing-unknown-heading" className="text-lg font-semibold">
              Not interpreted
            </h2>
            <p className="mt-1 text-xs leading-5 text-white/42">
              Everything the decoder saw but would not guess at, shown raw rather than hidden.
            </p>
            <div className="mt-4">
              <UnknownFieldsPanel unknownFields={report.unknownFields} />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
