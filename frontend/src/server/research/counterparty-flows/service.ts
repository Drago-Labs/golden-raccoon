import { validateAccountInput } from "./accountInput";
import { aggregateFlows } from "./aggregation";
import { readClaims } from "./claimReader";
import { computeConcentration, formatStroops, parseStroops } from "./concentration";
import { coverageNotice } from "./coverage";
import { defaultIdentityResolver, labelCounterparties, type IdentityResolver } from "./counterpartyLabels";
import { CounterpartyFlowsError, type CounterpartyState } from "./errors";
import { COUNTERPARTY_FLOW_LIMITS } from "./limits";
import { readPathPayments } from "./pathPaymentReader";
import { readPayments, type ReadOutcome } from "./paymentReader";
import {
  COUNTERPARTY_FLOW_SCHEMA_VERSION,
  counterpartyFlowRequestSchema,
  type ConcentrationSlice,
  type CounterpartyFlowReport,
  type FlowEvent,
  type StellarNetwork,
} from "./schema";
import { resolveWindow, type ResolvedWindow } from "./windowing";

export type CounterpartyFlowDeps = {
  readPayments: (
    network: StellarNetwork,
    account: string,
    window: ResolvedWindow,
  ) => Promise<ReadOutcome>;
  readPathPayments: (
    network: StellarNetwork,
    account: string,
    window: ResolvedWindow,
  ) => Promise<ReadOutcome>;
  readClaims: (
    network: StellarNetwork,
    account: string,
    window: ResolvedWindow,
  ) => Promise<ReadOutcome>;
  identityResolver: IdentityResolver;
  nowMs: () => number;
};

const productionDeps: CounterpartyFlowDeps = {
  readPayments,
  readPathPayments,
  readClaims,
  identityResolver: defaultIdentityResolver,
  nowMs: () => Date.now(),
};

function unavailableReport(
  account: string,
  network: StellarNetwork,
  window: ResolvedWindow,
  reason: string,
): CounterpartyFlowReport {
  return {
    schemaVersion: COUNTERPARTY_FLOW_SCHEMA_VERSION,
    account,
    network,
    windowStart: window.start,
    windowEnd: window.end,
    state: "unavailable",
    totals: [],
    concentration: [],
    eventCount: 0,
    historyTruncated: false,
    coverageNotice: `${coverageNotice("unavailable", 0, false, false)} ${reason}`,
    readOnly: true,
  };
}

function buildConcentration(totals: CounterpartyFlowReport["totals"]): ConcentrationSlice[] {
  const groups = new Map<string, { direction: "in" | "out"; asset: string; amounts: bigint[] }>();
  for (const row of totals) {
    const key = `${row.direction}|${row.asset}`;
    const bucket = groups.get(key) ?? { direction: row.direction, asset: row.asset, amounts: [] };
    bucket.amounts.push(parseStroops(row.amount));
    groups.set(key, bucket);
  }

  return [...groups.values()].map((group) => {
    const concentration = computeConcentration(group.amounts, COUNTERPARTY_FLOW_LIMITS.topNs);
    return {
      direction: group.direction,
      asset: group.asset,
      defined: concentration.defined,
      counterpartyCount: concentration.counterpartyCount,
      totalAmount: formatStroops(concentration.totalStroops),
      topShares: concentration.topShares.map((share) => ({
        n: share.n,
        share: share.share,
        amount: formatStroops(share.stroops),
      })),
      herfindahl: concentration.herfindahl,
    };
  });
}

/**
 * Profiles who an account pays and is paid by over a bounded window.
 * Volumes are decimal-safe; labels come only from the identity resolver.
 */
export async function profileCounterparties(
  input: unknown,
  deps: CounterpartyFlowDeps = productionDeps,
): Promise<CounterpartyFlowReport> {
  const parsed = counterpartyFlowRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new CounterpartyFlowsError("invalid_request", "The counterparty-flow request is invalid.", parsed.error.flatten());
  }

  const validated = validateAccountInput(parsed.data);
  const { account, network } = validated;
  const window = resolveWindow(parsed.data.window, parsed.data.windowStart, parsed.data.windowEnd, deps.nowMs());

  const [payments, pathPayments, claims] = await Promise.all([
    deps.readPayments(network, account, window),
    deps.readPathPayments(network, account, window),
    deps.readClaims(network, account, window),
  ]);

  const outcomes = [payments, pathPayments, claims];
  if (outcomes.every((outcome) => outcome.status === "unavailable")) {
    const reason = outcomes.find((outcome) => outcome.status === "unavailable")?.reason ?? "provider unavailable";
    return unavailableReport(account, network, window, reason);
  }
  if (outcomes.some((outcome) => outcome.status === "missing") && outcomes.every((outcome) => outcome.status !== "ok")) {
    throw new CounterpartyFlowsError("not_found", "No account was recorded for this id on the selected network.");
  }

  const events: FlowEvent[] = [];
  const seen = new Set<string>();
  let truncated = false;
  let reachedWindowStart = true;

  for (const outcome of outcomes) {
    if (outcome.status === "unavailable") {
      truncated = true;
      reachedWindowStart = false;
      continue;
    }
    if (outcome.status !== "ok") continue;
    truncated = truncated || outcome.truncated;
    reachedWindowStart = reachedWindowStart && outcome.reachedWindowStart;
    for (const event of outcome.events) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      events.push(event);
    }
  }

  if (events.length > COUNTERPARTY_FLOW_LIMITS.maxEvents) {
    truncated = true;
    events.length = COUNTERPARTY_FLOW_LIMITS.maxEvents;
  }

  const counterparties = [...new Set(events.map((event) => event.counterparty))];
  const labels = labelCounterparties(counterparties, deps.identityResolver);
  const totals = aggregateFlows(events, labels);
  const concentration = buildConcentration(totals);

  const reasons = truncated || !reachedWindowStart || outcomes.some((outcome) => outcome.status === "unavailable");
  const state: CounterpartyState = reasons ? "partial" : "complete";

  return {
    schemaVersion: COUNTERPARTY_FLOW_SCHEMA_VERSION,
    account,
    network,
    windowStart: window.start,
    windowEnd: window.end,
    state,
    totals,
    concentration,
    eventCount: events.length,
    historyTruncated: truncated,
    coverageNotice: coverageNotice(state, events.length, truncated, reachedWindowStart),
    readOnly: true,
  };
}
