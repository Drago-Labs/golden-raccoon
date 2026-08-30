import "server-only";

import { stellarNetworks, getStellarRpcUrls } from "@/lib/stellar/config";
import { getApprovedPubnetConfig, type ApprovedPubnetConfig } from "@/server/stellar/config";
import { fail, pass, type PubnetCheckResult } from "@/server/stellar/checks/types";

const ID = "rpc_independence" as const;
const TITLE = "RPC provider independence";

export interface LedgerProbe {
  url: string;
  ledger: number | null;
}

/** Reads the latest ledger height from one provider, or null if unreachable. */
export type LedgerReader = (rpcUrl: string) => Promise<number | null>;

/**
 * Two providers on the same host are one provider.
 *
 * Registrable-domain comparison rather than exact hostname: `a.example.com` and
 * `b.example.com` share an operator and fail together, which is precisely the
 * outage a fallback is supposed to survive.
 */
export function providerIdentity(rpcUrl: string): string | null {
  try {
    const { hostname } = new URL(rpcUrl);
    return hostname.split(".").slice(-2).join(".").toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Verifies that pubnet has a real fallback and that the providers agree.
 *
 * Disagreement matters as much as unreachability: two providers reporting
 * ledger heights far apart means at least one is serving stale state, and a
 * risk decision made against stale state is not the decision that was reviewed.
 */
export async function checkRpcIndependence(
  readLedger: LedgerReader,
  approved: ApprovedPubnetConfig = getApprovedPubnetConfig(),
): Promise<PubnetCheckResult> {
  const urls = getStellarRpcUrls(stellarNetworks["stellar-pubnet"]);

  if (urls.length < 2) {
    return fail(
      ID,
      TITLE,
      "rpc_providers_insufficient",
      "Pubnet has no fallback RPC provider configured, so a single provider outage takes " +
        "the network path down with it.",
      { providerCount: urls.length },
    );
  }

  const identities = urls.map(providerIdentity);

  if (identities.some((identity) => identity === null)) {
    return fail(
      ID,
      TITLE,
      "rpc_providers_dependent",
      "At least one configured pubnet RPC URL cannot be parsed, so provider independence " +
        "cannot be established.",
    );
  }

  if (new Set(identities).size < 2) {
    return fail(
      ID,
      TITLE,
      "rpc_providers_dependent",
      "Every configured pubnet RPC provider resolves to the same operator, so the fallback " +
        "would fail at the same moment as the primary.",
      { operators: [...new Set(identities)].join(", ") },
    );
  }

  const probes: LedgerProbe[] = await Promise.all(
    urls.map(async (url) => ({ url, ledger: await readLedger(url).catch(() => null) })),
  );

  const unreachable = probes.filter((probe) => probe.ledger === null);

  if (unreachable.length > 0) {
    return fail(
      ID,
      TITLE,
      "rpc_provider_unreachable",
      `${unreachable.length} of ${probes.length} configured pubnet RPC providers did not ` +
        "report a ledger height. An unverifiable provider is not a working fallback.",
      { unreachableCount: unreachable.length, providerCount: probes.length },
    );
  }

  const heights = probes.map((probe) => probe.ledger as number);
  const spread = Math.max(...heights) - Math.min(...heights);

  if (spread > approved.rpcLedgerTolerance) {
    return fail(
      ID,
      TITLE,
      "rpc_ledger_disagreement",
      `Pubnet RPC providers disagree by ${spread} ledgers, beyond the tolerated ` +
        `${approved.rpcLedgerTolerance}. At least one is serving stale state.`,
      { ledgerSpread: spread, tolerance: approved.rpcLedgerTolerance },
    );
  }

  return pass(
    ID,
    TITLE,
    `${probes.length} independent pubnet RPC providers are reachable and agree within ` +
      `${spread} ledger(s).`,
    { providerCount: probes.length, ledgerSpread: spread },
  );
}
