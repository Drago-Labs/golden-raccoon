import {
  checkSimulationFreshness,
  checkCalldataMatch,
  checkParamsMatch,
  isHighRiskExecution,
} from "../src/server/simulation/freshness";
import type { SimulationResultDetail } from "../src/server/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function passedSimulation(overrides: Partial<SimulationResultDetail> = {}): SimulationResultDetail {
  return {
    provider: "eth_call",
    status: "passed",
    checks: ["Approval simulation", "Sell/swap simulation"],
    detail: "Simulation passed.",
    simulatedTxHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    simulatedAt: new Date().toISOString(),
    blockNumber: 1000,
    fromAmount: "100",
    route: ["USDC", "ETH"],
    slippageBps: 100,
    sequenceNumber: 42,
    fee: "0.005 ETH",
    ...overrides,
  };
}

function runFreshnessTests() {
  const now = Date.now();

  assert(isHighRiskExecution("reduce_exposure", 60) === true, "High risk action with score >=50 must be high-risk.");
  assert(isHighRiskExecution("swap_to_stable", 30) === false, "Low risk action must not be high-risk.");
  assert(isHighRiskExecution("hold", 80) === false, "Non-trade action must not be high-risk.");
  assert(isHighRiskExecution(undefined, undefined) === false, "Undefined action must not be high-risk.");

  const fresh = checkSimulationFreshness(passedSimulation(), 1000);
  assert(fresh.fresh === true, "Fresh simulation with same block must be fresh.");

  assert(checkSimulationFreshness(passedSimulation({ status: "not_required" })).fresh === true, "not_required must always be fresh.");

  const failedCheck = checkSimulationFreshness(passedSimulation({ status: "failed" }));
  assert(failedCheck.fresh === false, "Failed simulation must not be fresh.");
  assert(failedCheck.reason?.includes("failed"), "Failed simulation reason must mention failure.");

  const unavailableCheck = checkSimulationFreshness(passedSimulation({ status: "unavailable" }));
  assert(unavailableCheck.fresh === false, "Unavailable simulation must not be fresh.");

  const pendingCheck = checkSimulationFreshness(passedSimulation({ status: "pending" }));
  assert(pendingCheck.fresh === false, "Pending simulation must not be fresh.");

  const staleBlock = checkSimulationFreshness(passedSimulation({ blockNumber: 980 }), 1000);
  assert(staleBlock.fresh === true, "Simulation within maxBlockAge must be fresh.");

  const veryStaleBlock = checkSimulationFreshness(passedSimulation({ blockNumber: 800 }), 1000);
  assert(veryStaleBlock.fresh === false, "Simulation beyond maxBlockAge must be stale.");
  assert(veryStaleBlock.reason?.includes("blocks"), "Block stale reason must mention block count.");

  const staleLedger = checkSimulationFreshness(passedSimulation({ ledgerSeq: 980 }), undefined, 1000);
  assert(staleLedger.fresh === true, "Simulation within maxLedgerAge must be fresh.");

  const veryStaleLedger = checkSimulationFreshness(passedSimulation({ ledgerSeq: 800 }), undefined, 1000);
  assert(veryStaleLedger.fresh === false, "Simulation beyond maxLedgerAge must be stale.");
  assert(veryStaleLedger.reason?.includes("ledgers"), "Ledger stale reason must mention ledger count.");

  const expiredQuote = checkSimulationFreshness(
    passedSimulation({ quoteExpiry: new Date(now - 60_000).toISOString() }),
  );
  assert(expiredQuote.fresh === false, "Expired quote must make simulation stale.");
  assert(expiredQuote.reason?.includes("quote"), "Expired quote reason must mention quote.");

  const futureQuote = checkSimulationFreshness(
    passedSimulation({ quoteExpiry: new Date(now + 300_000).toISOString() }),
  );
  assert(futureQuote.fresh === true, "Future quote expiry must be fresh.");

  const elapsedStale = checkSimulationFreshness(
    passedSimulation({ simulatedAt: new Date(now - 600_000).toISOString() }),
  );
  assert(elapsedStale.fresh === false, "Simulation past maxElapsedMs must be stale.");
  assert(elapsedStale.reason?.includes("elapsed") || elapsedStale.reason?.includes("minutes"), "Elapsed stale reason must mention time.");
  assert(typeof elapsedStale.expiredAt === "string", "Elapsed stale must provide expiredAt timestamp.");

  const missingTimestamp = checkSimulationFreshness(passedSimulation({ simulatedAt: undefined }));
  assert(missingTimestamp.fresh === false, "Missing simulation timestamp must not be fresh.");

  const invalidTimestamp = checkSimulationFreshness(passedSimulation({ simulatedAt: "not-a-date" }));
  assert(invalidTimestamp.fresh === false, "Invalid simulation timestamp must not be fresh.");

  console.log("Freshness tests passed.");
}

function runInvalidationTests() {
  const fullParams = {
    amount: "100",
    route: ["USDC", "ETH"],
    slippageBps: 100,
    sequenceNumber: 42,
    fee: "0.005 ETH",
  };

  assert(checkParamsMatch(passedSimulation(), fullParams) === true, "All params matching must pass.");
  assert(checkParamsMatch(passedSimulation({ fromAmount: "200" }), { ...fullParams, amount: "200" }) === true, "Matching different amount must pass.");

  assert(checkParamsMatch(passedSimulation(), { ...fullParams, amount: "200" }) === false, "Changed amount must fail.");

  assert(checkParamsMatch(passedSimulation(), { ...fullParams, route: ["USDC", "BTC"] }) === false, "Changed route token must fail.");
  assert(checkParamsMatch(passedSimulation(), { ...fullParams, route: ["USDC", "ETH", "BTC"] }) === false, "Route length mismatch must fail.");

  assert(checkParamsMatch(passedSimulation(), { ...fullParams, slippageBps: 200 }) === false, "Changed slippage must fail.");

  assert(checkParamsMatch(passedSimulation(), { ...fullParams, sequenceNumber: 99 }) === false, "Changed sequence must fail.");
  assert(checkParamsMatch(passedSimulation(), { ...fullParams, sequenceNumber: "42" }) === true, "String vs number sequence must still match.");

  assert(checkParamsMatch(passedSimulation(), { ...fullParams, fee: "0.01 ETH" }) === false, "Changed fee must fail.");

  const noSim = passedSimulation({ status: "not_required", fromAmount: undefined, route: undefined, slippageBps: undefined, sequenceNumber: undefined, fee: undefined });
  assert(checkParamsMatch(noSim, { amount: "100" }) === true, "not_required simulation must always match params.");
  assert(checkCalldataMatch(noSim, "anything") === true, "not_required simulation must always match calldata.");

  const calldataSim = passedSimulation({ calldataHash: "0xabc123" });
  assert(checkCalldataMatch(calldataSim, "0xabc123") === true, "Matching calldata hash must pass.");
  assert(checkCalldataMatch(calldataSim, "0xdef456") === false, "Different calldata hash must fail.");
  assert(checkCalldataMatch(calldataSim, undefined) === false, "Missing current calldata must fail.");

  const noHashSim = passedSimulation({ calldataHash: undefined });
  assert(checkCalldataMatch(noHashSim, "0xabc123") === false, "Missing simulation calldata hash must fail.");

  assert(checkParamsMatch(passedSimulation({ fromAmount: "100" }), { ...fullParams, amount: undefined }) === false, "Sim has fromAmount but current absent -> fail-closed.");
  assert(checkParamsMatch(passedSimulation({ route: ["USDC", "ETH"] }), { ...fullParams, route: undefined }) === false, "Sim has route but current absent -> fail-closed.");
  assert(checkParamsMatch(passedSimulation({ fee: "0.005 ETH" }), { ...fullParams, fee: undefined }) === false, "Sim has fee but current absent -> fail-closed.");

  console.log("Invalidation tests passed.");
}

function runLowRiskPathTests() {
  const notRequiredSim = passedSimulation({ status: "not_required" });
  const fresh = checkSimulationFreshness(notRequiredSim);
  assert(fresh.fresh === true, "Low-risk path (not_required) must not block.");

  assert(isHighRiskExecution("watch", 80) === false, "Non-trade actions must not be high-risk even with high score.");
  assert(isHighRiskExecution("hold", 95) === false, "Hold must not be high-risk.");
  assert(isHighRiskExecution("avoid", 75) === false, "Avoid must not be high-risk.");
  assert(isHighRiskExecution("no_action", 60) === false, "No_action must not be high-risk.");

  console.log("Low-risk path tests passed.");
}

function runServerSideValidationTests() {
  const passed = passedSimulation({ simulatedAt: new Date(Date.now() - 120_000).toISOString() });
  const fresh = checkSimulationFreshness(passed, 1000);
  assert(fresh.fresh === true, "Server: Fresh simulation must pass server-side check.");
}

runFreshnessTests();
runInvalidationTests();
runLowRiskPathTests();
runServerSideValidationTests();

console.log("All simulation freshness tests passed.");
