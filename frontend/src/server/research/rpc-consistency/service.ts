/**
 * Compare Horizon and Stellar RPC for one account or contract.
 *
 * Probes are arguments so fixture tests never touch the network. A ledger gap
 * is classified later as lag. This function only reads, then returns a report.
 */
import { StrKey } from "@stellar/stellar-sdk";
import { classifyFields } from "./classify";
import { buildCoverage } from "./coverage";
import { unavailable, RpcConsistencyError, type ProviderState } from "./errors";
import { readHorizon } from "./horizonProbe";
import { summarizeLag } from "./ledgerAlignment";
import { clampList, CONSISTENCY_LIMITS } from "./limits";
import { assertObservedPassphrase, assertProviderEndpoint, resolveNetworkIdentity } from "./networkIdentity";
import { normalizeObservations } from "./normalize";
import { providerStatuses } from "./providerStatus";
import { readRpc } from "./rpcProbe";
import {
  CONSISTENCY_SCHEMA_VERSION,
  consistencyRequestSchema,
  type ConsistencyReport,
  type HorizonObservation,
  type ProbeTarget,
  type RpcAccount,
  type RpcObservation,
  type TargetKind,
  type TrustlineHint,
} from "./schema";

export type ConsistencyDependencies = {
  readHorizon?: (target: ProbeTarget) => Promise<ProviderState<HorizonObservation>>;
  readRpc?: (target: ProbeTarget) => Promise<ProviderState<RpcObservation>>;
};

function targetKind(id: string): TargetKind | null {
  if (StrKey.isValidEd25519PublicKey(id)) return "account";
  if (StrKey.isValidContract(id)) return "contract";

  return null;
}

async function bounded<T>(run: () => Promise<ProviderState<T>>, label: string): Promise<ProviderState<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      run().catch((error: unknown) =>
        unavailable<T>(error instanceof Error ? error.message : `${label} could not be read.`),
      ),
      new Promise<ProviderState<T>>((resolve) => {
        timer = setTimeout(() => {
          resolve(unavailable(`${label} did not answer within ${CONSISTENCY_LIMITS.timeoutMs}ms.`));
        }, CONSISTENCY_LIMITS.timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function guard(network: ReturnType<typeof resolveNetworkIdentity>, state: ProviderState<HorizonObservation | RpcObservation>): void {
  if (state.status !== "available") return;

  if (state.observation.network !== network.id) {
    throw new RpcConsistencyError(
      "network_mismatch",
      `A ${state.observation.network} answer cannot be compared with ${network.id}.`,
    );
  }

  assertProviderEndpoint(network, state.observation.provider, state.observation.endpoint);
  assertObservedPassphrase(network, state.observation.passphrase);
}

function trustlineId(line: TrustlineHint): string {
  return `${line.code}:${line.issuer}`;
}

function mergeRpc(base: RpcObservation, extra: RpcObservation): RpcObservation {
  const account: RpcAccount | null = base.account
    ? {
        ...base.account,
        trustlines: [...base.account.trustlines],
      }
    : extra.account
      ? { ...extra.account, trustlines: [...extra.account.trustlines] }
      : null;

  if (account && extra.account) {
    const seen = new Set(account.trustlines.map((line) => trustlineId(line)));

    for (const line of extra.account.trustlines) {
      const id = trustlineId(line);

      if (seen.has(id)) continue;

      seen.add(id);
      account.trustlines.push(line);
    }
  }

  return {
    ...base,
    account,
    contractEntries: base.contractEntries.length > 0 ? base.contractEntries : extra.contractEntries,
    omittedLedgerKeys: base.omittedLedgerKeys + extra.omittedLedgerKeys,
    omittedTrustlines: base.omittedTrustlines + extra.omittedTrustlines,
  };
}

export async function compareRpcConsistency(
  input: unknown,
  dependencies: ConsistencyDependencies = {},
): Promise<ConsistencyReport> {
  const parsed = consistencyRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new RpcConsistencyError("invalid_request", "The consistency request could not be read.", parsed.error.flatten());
  }

  const kind = targetKind(parsed.data.target);

  if (!kind) {
    throw new RpcConsistencyError("invalid_target", "Provide a Stellar account id (G…) or contract id (C…).");
  }

  const identity = resolveNetworkIdentity(parsed.data.network);
  const hintedTrustlines = clampList(parsed.data.trustlines, CONSISTENCY_LIMITS.maxTrustlines);
  const hintedKeys = clampList(parsed.data.contractDataKeys, CONSISTENCY_LIMITS.maxContractKeys);
  const readHorizonProbe = dependencies.readHorizon ?? readHorizon;
  const readRpcProbe = dependencies.readRpc ?? readRpc;

  const target: ProbeTarget = {
    network: identity.id,
    horizonUrl: identity.horizonUrl,
    rpcUrl: identity.rpcUrl,
    passphrase: identity.passphrase,
    kind,
    id: parsed.data.target,
    trustlines: hintedTrustlines.kept,
    contractDataKeys: kind === "contract" ? hintedKeys.kept : [],
  };

  let horizon = await bounded(() => readHorizonProbe(target), "Horizon");
  let rpc = await bounded(() => readRpcProbe(target), "Stellar RPC");
  let followUpOmitted = 0;

  guard(identity, horizon);
  guard(identity, rpc);

  if (kind === "account" && horizon.status === "available" && rpc.status === "available" && horizon.observation.account) {
    const seen = new Set((rpc.observation.account?.trustlines ?? []).map((line) => trustlineId(line)));
    const missing = horizon.observation.account.trustlines.filter((line) => !seen.has(trustlineId(line)));
    const capped = clampList(missing, CONSISTENCY_LIMITS.maxTrustlines);
    followUpOmitted = capped.omitted;

    if (capped.kept.length > 0) {
      const followUp = await bounded(
        () =>
          readRpcProbe({
            ...target,
            trustlines: capped.kept,
            contractDataKeys: [],
          }),
        "Stellar RPC",
      );

      if (followUp.status === "available") {
        guard(identity, followUp);
        rpc = { status: "available", observation: mergeRpc(rpc.observation, followUp.observation) };
      }
    }
  }

  const horizonObservation = horizon.status === "available" ? horizon.observation : null;
  const rpcObservation = rpc.status === "available" ? rpc.observation : null;
  const fields = classifyFields(normalizeObservations({ horizon: horizonObservation, rpc: rpcObservation }), {
    horizonAvailable: horizon.status === "available",
    rpcAvailable: rpc.status === "available",
  });
  const providers = providerStatuses({
    network: identity.id,
    horizonEndpoint: identity.horizonUrl,
    rpcEndpoint: identity.rpcUrl,
    horizon,
    rpc,
  });
  const omittedTrustlines =
    hintedTrustlines.omitted +
    followUpOmitted +
    (horizonObservation?.omittedTrustlines ?? 0) +
    (rpcObservation?.omittedTrustlines ?? 0);
  const omittedLedgerKeys = hintedKeys.omitted + (rpcObservation?.omittedLedgerKeys ?? 0);

  return {
    schemaVersion: CONSISTENCY_SCHEMA_VERSION,
    network: identity.id,
    target: { kind, id: parsed.data.target },
    providers,
    fields,
    lag: summarizeLag(fields, providers),
    coverage: buildCoverage({
      fields,
      providers,
      horizonContractDataExposed: horizonObservation?.contractDataExposed ?? false,
      omittedTrustlines,
      omittedLedgerKeys,
    }),
    readOnly: true,
  };
}
