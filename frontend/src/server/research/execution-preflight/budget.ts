/**
 * Build budget rows and blockers from a prepared plan + simulation snapshot.
 */
import { addAmounts, compareAmounts, parseIntAmount, subtractAmounts, wouldOverflowNumber } from "./amounts";
import type { BudgetRow, ChainFamily, PreflightBlocker, PreflightRequest } from "./schema";

export function buildFeeRows(request: PreflightRequest): { rows: BudgetRow[]; blockers: PreflightBlocker[] } {
  const rows: BudgetRow[] = [];
  const blockers: PreflightBlocker[] = [];
  const { simulation, preparedPlan } = request;

  if (simulation.feeStatus === "unavailable") {
    blockers.push({
      code: "unavailable_fee",
      detail: "Fee estimate is unavailable, so a complete budget cannot be claimed.",
    });
    rows.push({
      rowId: "fee-unknown",
      label: preparedPlan.chainFamily === "evm" ? "EVM gas fee" : "Stellar network fees",
      amount: null,
      unit: preparedPlan.chainFamily === "evm" ? "wei" : "stroops",
      kind: "unknown",
      source: "simulation",
      note: "Fee estimate unavailable.",
    });
    return { rows, blockers };
  }

  if (preparedPlan.chainFamily === "evm") {
    if (!simulation.evmGasFeeWei) {
      blockers.push({
        code: "missing_mandatory",
        detail: "EVM gas fee is mandatory for an EVM preflight and was not supplied.",
      });
    } else {
      rows.push({
        rowId: "evm-gas",
        label: "EVM gas fee",
        amount: simulation.evmGasFeeWei,
        unit: "wei",
        kind: "estimate",
        source: "simulation.evmGasFeeWei",
        note: "Estimated gas cost in wei. Distinct from Stellar base/resource fees.",
      });
    }
  } else {
    if (!simulation.stellarBaseFeeStroops) {
      blockers.push({
        code: "missing_mandatory",
        detail: "Stellar base fee is mandatory for a Stellar preflight and was not supplied.",
      });
    } else {
      rows.push({
        rowId: "stellar-base-fee",
        label: "Stellar base fee",
        amount: simulation.stellarBaseFeeStroops,
        unit: "stroops",
        kind: "exact",
        source: "simulation.stellarBaseFeeStroops",
        note: "Base fee in stroops. Distinguished from resource fees.",
      });
    }

    if (simulation.stellarResourceFeeStroops) {
      rows.push({
        rowId: "stellar-resource-fee",
        label: "Stellar resource fee",
        amount: simulation.stellarResourceFeeStroops,
        unit: "stroops",
        kind: "exact",
        source: "simulation.stellarResourceFeeStroops",
        note: "Resource fee in stroops. Distinguished from base fee.",
      });
    }
  }

  return { rows, blockers };
}

export function buildSpendRows(request: PreflightRequest): BudgetRow[] {
  const plan = request.preparedPlan;
  return [
    {
      rowId: "spend",
      label: "Quoted token spend",
      amount: plan.spendAmount,
      unit: plan.spendUnit,
      kind: "exact",
      source: "preparedPlan.spendAmount",
      note: "Exact integer spend from the prepared plan.",
    },
    {
      rowId: "min-receive",
      label: "Minimum receive",
      amount: plan.minReceiveAmount,
      unit: plan.minReceiveUnit,
      kind: "exact",
      source: "preparedPlan.minReceiveAmount",
      note: `Enforced slippage bound at ${plan.slippageBps} bps.`,
    },
    {
      rowId: "wallet-available",
      label: "Wallet available",
      amount: plan.walletAvailableAmount,
      unit: plan.walletAvailableUnit,
      kind: "exact",
      source: "preparedPlan.walletAvailableAmount",
      note: "Available balance before the action.",
    },
    {
      rowId: "reserve-required",
      label: "Reserve required",
      amount: plan.reserveRequiredAmount,
      unit: plan.reserveUnit,
      kind: "exact",
      source: "preparedPlan.reserveRequiredAmount",
      note: plan.chainFamily === "stellar" ? "Account reserve that must remain after the action." : "No Stellar-style reserve on EVM (zero).",
    },
  ];
}

export function collectBlockers(request: PreflightRequest, feeBlockers: PreflightBlocker[]): PreflightBlocker[] {
  const blockers = [...feeBlockers];
  const { preparedPlan: plan, simulation, observedAt, staleAfterSeconds } = request;

  if (plan.network !== simulation.network) {
    blockers.push({
      code: "network_mismatch",
      detail: `Prepared plan network (${plan.network}) does not match simulation network (${simulation.network}).`,
    });
  }

  if (plan.planHash !== simulation.planHash) {
    blockers.push({
      code: "plan_hash_mismatch",
      detail: "Prepared plan hash does not match the simulation plan hash.",
    });
  }

  const observedMs = Date.parse(observedAt);
  const simulatedMs = Date.parse(simulation.simulatedAt);
  if (Number.isFinite(observedMs) && Number.isFinite(simulatedMs)) {
    const ageSeconds = Math.floor((observedMs - simulatedMs) / 1000);
    if (ageSeconds > staleAfterSeconds) {
      blockers.push({
        code: "stale_simulation",
        detail: `Simulation is ${ageSeconds}s old, beyond the ${staleAfterSeconds}s freshness window.`,
      });
    }
  }

  if (plan.maxSlippageBps !== undefined && plan.slippageBps > plan.maxSlippageBps) {
    blockers.push({
      code: "max_slippage",
      detail: `Slippage ${plan.slippageBps} bps exceeds the policy maximum of ${plan.maxSlippageBps} bps.`,
    });
  }

  for (const amount of [plan.spendAmount, plan.walletAvailableAmount, plan.reserveRequiredAmount, plan.minReceiveAmount]) {
    if (wouldOverflowNumber(amount)) {
      blockers.push({
        code: "overflow",
        detail: "An amount exceeds JavaScript safe integer range; exact bigint arithmetic is required for display bounds.",
      });
      break;
    }
  }

  try {
    const feeTotal = feeTotalFor(plan.chainFamily, simulation);
    if (plan.spendUnit === plan.walletAvailableUnit) {
      const needed = feeTotal && plan.spendUnit === nativeUnit(plan.chainFamily)
        ? addAmounts(plan.spendAmount, feeTotal, plan.reserveRequiredAmount)
        : addAmounts(plan.spendAmount, plan.reserveRequiredAmount);
      if (compareAmounts(plan.walletAvailableAmount, needed) < 0) {
        blockers.push({
          code: "insufficient_reserve",
          detail: `Wallet available ${plan.walletAvailableAmount} is below required spend+reserve(+fees when same unit) ${needed}.`,
        });
      }
    } else if (compareAmounts(plan.walletAvailableAmount, plan.spendAmount) < 0) {
      blockers.push({
        code: "insufficient_reserve",
        detail: `Wallet available ${plan.walletAvailableAmount} is below spend ${plan.spendAmount}.`,
      });
    }
  } catch {
    blockers.push({
      code: "overflow",
      detail: "Amount arithmetic overflowed while checking reserve sufficiency.",
    });
  }

  return blockers;
}

function nativeUnit(family: ChainFamily): string {
  return family === "evm" ? "wei" : "stroops";
}

function feeTotalFor(
  family: ChainFamily,
  simulation: PreflightRequest["simulation"],
): string | null {
  if (simulation.feeStatus === "unavailable") return null;
  if (family === "evm") return simulation.evmGasFeeWei ?? null;
  const parts = [simulation.stellarBaseFeeStroops, simulation.stellarResourceFeeStroops].filter(Boolean) as string[];
  if (parts.length === 0) return null;
  return addAmounts(...parts);
}

export function computeTotals(
  request: PreflightRequest,
  feeRows: BudgetRow[],
): PreflightReportTotals {
  const plan = request.preparedPlan;
  const feeAmounts = feeRows.filter((row) => row.amount && row.unit === plan.spendUnit).map((row) => row.amount!) ;
  const worstParts = [plan.spendAmount, ...feeAmounts];
  let worstCaseSpend: string | null = null;
  try {
    worstCaseSpend = addAmounts(...worstParts);
  } catch {
    worstCaseSpend = null;
  }

  let postTxBalance: string | null = null;
  try {
    if (plan.walletAvailableUnit === plan.spendUnit && worstCaseSpend) {
      const afterSpend = subtractAmounts(plan.walletAvailableAmount, plan.spendAmount);
      // Reserve is a floor, not an additional debit beyond spend when already reserved.
      postTxBalance = afterSpend;
      if (compareAmounts(postTxBalance, plan.reserveRequiredAmount) < 0) {
        postTxBalance = postTxBalance; // still report; blocker covers insufficiency
      }
    }
  } catch {
    postTxBalance = null;
  }

  return {
    worstCaseSpend,
    worstCaseSpendUnit: plan.spendUnit,
    postTxBalance,
    postTxBalanceUnit: plan.walletAvailableUnit,
  };
}

type PreflightReportTotals = {
  worstCaseSpend: string | null;
  worstCaseSpendUnit: string;
  postTxBalance: string | null;
  postTxBalanceUnit: string;
};

export function assertExactInts(request: PreflightRequest): void {
  for (const value of [
    request.preparedPlan.spendAmount,
    request.preparedPlan.minReceiveAmount,
    request.preparedPlan.walletAvailableAmount,
    request.preparedPlan.reserveRequiredAmount,
  ]) {
    parseIntAmount(value);
  }
}
