import type { PreflightRequest } from "@/server/research/execution-preflight/schema";

const OBSERVED = "2026-01-20T12:00:00.000Z";
const SIM_AT = "2026-01-20T11:59:30.000Z";

export const stellarComplete: PreflightRequest = {
  observedAt: OBSERVED,
  staleAfterSeconds: 120,
  preparedPlan: {
    planHash: "plan-stellar-1",
    network: "stellar-pubnet",
    chainFamily: "stellar",
    spendAmount: "10000000",
    spendUnit: "stroops",
    minReceiveAmount: "9900000",
    minReceiveUnit: "stroops",
    slippageBps: 100,
    maxSlippageBps: 200,
    walletAvailableAmount: "50000000",
    walletAvailableUnit: "stroops",
    reserveRequiredAmount: "5000000",
    reserveUnit: "stroops",
  },
  simulation: {
    planHash: "plan-stellar-1",
    network: "stellar-pubnet",
    simulatedAt: SIM_AT,
    stellarBaseFeeStroops: "100",
    stellarResourceFeeStroops: "5000",
    feeStatus: "available",
  },
};

export const evmComplete: PreflightRequest = {
  observedAt: OBSERVED,
  preparedPlan: {
    planHash: "plan-evm-1",
    network: "ethereum",
    chainFamily: "evm",
    spendAmount: "1000000000000000000",
    spendUnit: "wei",
    minReceiveAmount: "990000000000000000",
    minReceiveUnit: "wei",
    slippageBps: 50,
    maxSlippageBps: 100,
    walletAvailableAmount: "5000000000000000000",
    walletAvailableUnit: "wei",
    reserveRequiredAmount: "0",
    reserveUnit: "wei",
  },
  simulation: {
    planHash: "plan-evm-1",
    network: "ethereum",
    simulatedAt: SIM_AT,
    evmGasFeeWei: "21000000000000",
    feeStatus: "available",
  },
};

export const staleSimulation: PreflightRequest = {
  ...stellarComplete,
  observedAt: "2026-01-20T12:05:00.000Z",
  staleAfterSeconds: 60,
};

export const networkMismatch: PreflightRequest = {
  ...stellarComplete,
  simulation: { ...stellarComplete.simulation, network: "stellar-testnet" },
};

export const planHashMismatch: PreflightRequest = {
  ...stellarComplete,
  simulation: { ...stellarComplete.simulation, planHash: "other-plan" },
};

export const insufficientReserve: PreflightRequest = {
  ...stellarComplete,
  preparedPlan: {
    ...stellarComplete.preparedPlan,
    walletAvailableAmount: "10000100",
    reserveRequiredAmount: "5000000",
  },
};

export const maxSlippage: PreflightRequest = {
  ...stellarComplete,
  preparedPlan: { ...stellarComplete.preparedPlan, slippageBps: 500, maxSlippageBps: 100 },
};

export const unavailableFee: PreflightRequest = {
  ...evmComplete,
  simulation: {
    planHash: "plan-evm-1",
    network: "ethereum",
    simulatedAt: SIM_AT,
    feeStatus: "unavailable",
  },
};

export const overflowAmount: PreflightRequest = {
  ...evmComplete,
  preparedPlan: {
    ...evmComplete.preparedPlan,
    // 79 digits — beyond uint256 decimal length
    spendAmount: "1" + "0".repeat(78),
    walletAvailableAmount: "2" + "0".repeat(78),
  },
};
