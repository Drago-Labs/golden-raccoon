import type { StellarDeployment } from "./assetRegistry";
import { StablecoinFlowError } from "./errors";
import { STABLECOIN_FLOW_LIMITS } from "./limits";
import type { RawStellarPayment } from "./normalization";
import type { ResolvedWindow } from "./windowing";

type HorizonPayments = {
  _embedded?: { records?: RawStellarPayment[] };
  _links?: { next?: { href?: string } };
};

export type StellarReadResult = { payments: RawStellarPayment[]; truncated: boolean; reachedWindowStart: boolean };

async function horizon(url: string): Promise<HorizonPayments> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(STABLECOIN_FLOW_LIMITS.timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Horizon answered ${response.status}`);
  const payload = (await response.json()) as HorizonPayments;
  if (!payload || typeof payload !== "object") {
    throw new StablecoinFlowError("malformed_response", "Horizon did not return a payments page.");
  }
  return payload;
}

/**
 * Reads the issuing account's payments newest-first and stops at the start of
 * the window. Issuance and redemption of a classic Stellar asset are ordinary
 * payments from and to the issuing account, so this is the issuer's own ledger
 * record of every mint and burn — no indexer in between.
 */
export async function readStellarFlowEvents(
  horizonUrl: string,
  deployment: StellarDeployment,
  window: ResolvedWindow,
): Promise<StellarReadResult> {
  const base = horizonUrl.replace(/\/$/, "");
  let next: string | undefined =
    `${base}/accounts/${deployment.issuer}/payments?order=desc&limit=${STABLECOIN_FLOW_LIMITS.horizonPageSize}`;
  const payments: RawStellarPayment[] = [];
  let reachedWindowStart = false;
  let truncated = false;

  for (let page = 0; page < STABLECOIN_FLOW_LIMITS.maxHorizonPages && next; page += 1) {
    const body = await horizon(next);
    const records = body._embedded?.records ?? [];
    if (!Array.isArray(records)) {
      throw new StablecoinFlowError("malformed_response", "Horizon returned no usable payment records.");
    }
    for (const record of records) {
      const at = record.created_at ? Date.parse(record.created_at) : Number.NaN;
      if (Number.isFinite(at) && at < window.startMs) {
        // The page has walked past the start of the window: everything older is
        // outside it, so the window is fully covered.
        reachedWindowStart = true;
        break;
      }
      if (Number.isFinite(at) && at > window.endMs) continue;
      payments.push(record);
      if (payments.length >= STABLECOIN_FLOW_LIMITS.maxEventsPerChain) {
        truncated = true;
        break;
      }
    }
    if (reachedWindowStart || truncated) break;
    if (!records.length) {
      reachedWindowStart = true;
      break;
    }
    next = body._links?.next?.href;
  }

  return { payments, truncated, reachedWindowStart };
}
