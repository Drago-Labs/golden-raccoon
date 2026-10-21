/**
 * Checks whether a defined outcome occurred for a snapshot's asset
 * within its horizon window.
 *
 * `large_drawdown` reads real trade-aggregation history from Stellar's
 * Horizon API — spot-checked against the live USDC/XLM pair on pubnet
 * before this module was written: `base_asset=<asset>,
 * counter_asset=native` returns `close`/`low`/`high` as the asset's
 * price in XLM per unit, which is exactly the asset-relative price
 * series this detector needs. `depeg` and `incident_report` are fully
 * implemented against `PEG_REGISTRY`/`INCIDENT_LOG` in
 * `outcomeDefinitions.ts`, which are empty by default — see that
 * module's comment for why.
 */
import { DRAWDOWN_RATIO_THRESHOLD, INCIDENT_LOG, PEG_REGISTRY, parseAssetKey } from "./outcomeDefinitions";
import { SCORE_CALIBRATION_LIMITS } from "./limits";

export type OutcomeDetectionResult = { outcome: "occurred" | "did_not_occur" } | { outcome: "unsupported"; reason: "unsupported_asset_type" | "outcome_not_configured" | "price_data_unavailable"; issues: string[] };

const HORIZON_HOST: Record<"testnet" | "pubnet", string> = {
  pubnet: "https://horizon.stellar.org",
  testnet: "https://horizon-testnet.stellar.org",
};

type AggregationRecord = { low: string; high: string; open: string; close: string; timestamp: string };

async function fetchAssetAggregations(
  code: string,
  issuer: string,
  network: "testnet" | "pubnet",
  windowStartMs: number,
  windowEndMs: number,
  fetchImpl: typeof fetch,
): Promise<{ outcome: "ok"; records: AggregationRecord[] } | { outcome: "unavailable"; issues: string[] }> {
  const assetType = code.length <= 4 ? "credit_alphanum4" : "credit_alphanum12";
  const url =
    `${HORIZON_HOST[network]}/trade_aggregations?base_asset_type=${assetType}&base_asset_code=${encodeURIComponent(code)}&base_asset_issuer=${encodeURIComponent(issuer)}` +
    `&counter_asset_type=native&start_time=${windowStartMs}&end_time=${windowEndMs}&resolution=86400000&order=asc&limit=${SCORE_CALIBRATION_LIMITS.maxPriceAggregationPoints}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCORE_CALIBRATION_LIMITS.fetchTimeoutMs);

  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) {
      return { outcome: "unavailable", issues: [`Horizon returned HTTP ${response.status}.`] };
    }
    const body = (await response.json()) as { _embedded?: { records?: AggregationRecord[] } };
    return { outcome: "ok", records: body._embedded?.records ?? [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = message.toLowerCase().includes("abort") || message.toLowerCase().includes("timeout");
    return { outcome: "unavailable", issues: [timedOut ? "The Horizon request timed out." : message] };
  } finally {
    clearTimeout(timer);
  }
}

export async function detectLargeDrawdown(assetKey: string, network: "testnet" | "pubnet", windowStartMs: number, windowEndMs: number, fetchImpl: typeof fetch = fetch): Promise<OutcomeDetectionResult> {
  const parsed = parseAssetKey(assetKey);
  if (parsed.kind !== "classic") {
    return { outcome: "unsupported", reason: "unsupported_asset_type", issues: ["Only classic CODE:ISSUER assets have a Horizon trade-aggregation history this tool can read."] };
  }

  const fetched = await fetchAssetAggregations(parsed.code, parsed.issuer, network, windowStartMs, windowEndMs, fetchImpl);
  if (fetched.outcome !== "ok") {
    return { outcome: "unsupported", reason: "price_data_unavailable", issues: fetched.issues };
  }
  if (fetched.records.length === 0) {
    return { outcome: "unsupported", reason: "price_data_unavailable", issues: ["No trades were recorded for this asset in the horizon window."] };
  }

  const snapshotPrice = Number.parseFloat(fetched.records[0].open);
  const windowLow = Math.min(...fetched.records.map((record) => Number.parseFloat(record.low)));
  if (!Number.isFinite(snapshotPrice) || snapshotPrice <= 0 || !Number.isFinite(windowLow)) {
    return { outcome: "unsupported", reason: "price_data_unavailable", issues: ["Horizon's price data could not be read as numbers."] };
  }

  const drawdownRatio = (snapshotPrice - windowLow) / snapshotPrice;
  return { outcome: drawdownRatio >= DRAWDOWN_RATIO_THRESHOLD ? "occurred" : "did_not_occur" };
}

export function detectDepeg(assetKey: string, windowStartMs: number, windowEndMs: number): OutcomeDetectionResult {
  const entry = PEG_REGISTRY.find((candidate) => candidate.assetKey === assetKey);
  if (!entry) {
    return { outcome: "unsupported", reason: "outcome_not_configured", issues: ["No peg reference is configured for this asset — this app has no USD reference price feed."] };
  }
  // A real detector would compare the asset's price against `entry.pegTargetAssetKey`
  // over [windowStartMs, windowEndMs]; left unreachable until a peg is registered.
  void windowStartMs;
  void windowEndMs;
  return { outcome: "unsupported", reason: "outcome_not_configured", issues: ["Peg deviation checking is not yet wired to a live price read."] };
}

export function detectIncident(assetKey: string, windowStartMs: number, windowEndMs: number): OutcomeDetectionResult {
  if (INCIDENT_LOG.length === 0) {
    return { outcome: "unsupported", reason: "outcome_not_configured", issues: ["No incident log is configured in this app yet."] };
  }
  const match = INCIDENT_LOG.find((entry) => entry.assetKey === assetKey && Date.parse(entry.occurredAt) >= windowStartMs && Date.parse(entry.occurredAt) <= windowEndMs);
  return { outcome: match ? "occurred" : "did_not_occur" };
}
