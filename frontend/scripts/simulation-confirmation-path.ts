import {
  checkSimulationFreshness,
  checkCalldataMatch,
  checkParamsMatch,
  isHighRiskExecution,
  hashCalldata,
} from "../src/server/simulation/freshness";
import type { SimulationResultDetail } from "../src/server/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const FAIL = { status: 403 };

function simulateConfirmRoute(body: {
  action?: string;
  riskScore?: number;
  simulationStatus?: string;
  isStellar?: boolean;
  txHash?: string;
  stellarEnvelopeXdr?: string;
  simulation?:
    | (Partial<SimulationResultDetail> & { status?: string })
    | undefined
    | null;
  currentBlockNumber?: number;
  currentLedgerSeq?: number;
  currentCalldata?: string;
  currentFromAmount?: string;
  currentRoute?: string[];
  currentSlippageBps?: number;
  currentSequenceNumber?: number | string;
  currentFee?: string;
}): { status: number; error?: string } {
  const action = body.action;
  const riskScore = body.riskScore;
  const simStatus = body.simulationStatus ?? "passed";
  const sim = body.simulation;
  const isStellar = body.isStellar ?? false;
  const txHash = body.txHash ?? "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

  if (!simStatus) {
    return { status: 400, error: "Missing status" };
  }

  if (simStatus === "failed") {
    return FAIL;
  }

  if (simStatus === "unsupported") {
    return FAIL;
  }

  const highRiskTrade = isHighRiskExecution(action, riskScore);

  if (highRiskTrade && simStatus !== "passed") {
    return FAIL;
  }

  if (highRiskTrade) {
    if (!sim) {
      return FAIL;
    }

    const simulationDetail: SimulationResultDetail = {
      provider: "eth_call",
      status: simStatus as SimulationResultDetail["status"],
      checks: sim.checks ?? [],
      detail: sim.detail ?? "",
      simulatedTxHash: sim.simulatedTxHash ?? "",
      simulatedAt: sim.simulatedAt,
      blockNumber: sim.blockNumber,
      ledgerSeq: sim.ledgerSeq,
      quoteExpiry: sim.quoteExpiry,
      calldataHash: sim.calldataHash,
      fromAmount: sim.fromAmount,
      route: sim.route,
      slippageBps: sim.slippageBps,
      sequenceNumber: sim.sequenceNumber,
      fee: sim.fee,
      simulatedXdrHash: sim.simulatedXdrHash,
    };

    // Finding 1: txHash binding
    if (txHash !== simulationDetail.simulatedTxHash) {
      return FAIL;
    }

    // Finding 3: XDR binding for Stellar
    if (isStellar && body.stellarEnvelopeXdr) {
      if (!simulationDetail.simulatedXdrHash || body.stellarEnvelopeXdr !== simulationDetail.simulatedXdrHash) {
        return FAIL;
      }
    }

    // Finding 5: chain-appropriate freshness reference required
    if (isStellar) {
      if (!body.currentLedgerSeq) {
        return FAIL;
      }
    } else {
      if (!body.currentBlockNumber) {
        return FAIL;
      }
    }

    const freshness = checkSimulationFreshness(
      simulationDetail,
      body.currentBlockNumber,
      body.currentLedgerSeq,
    );

    if (!freshness.fresh) {
      return FAIL;
    }

    // Finding 4: EVM requires calldata (no fallback)
    if (!isStellar) {
      if (!body.currentCalldata) {
        return FAIL;
      }

      const currentCalldataHash = hashCalldata(body.currentCalldata);

      const calldataMatch = checkCalldataMatch(simulationDetail, currentCalldataHash);

      if (!calldataMatch) {
        return FAIL;
      }
    }

    const paramsMatch = checkParamsMatch(simulationDetail, {
      amount: body.currentFromAmount,
      route: body.currentRoute,
      slippageBps: body.currentSlippageBps,
      sequenceNumber: body.currentSequenceNumber,
      fee: body.currentFee,
    });

    if (!paramsMatch) {
      return FAIL;
    }
  }

  return { status: 200 };
}

function buildSim(overrides: Partial<SimulationResultDetail> = {}): SimulationResultDetail {
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
    calldataHash: hashCalldata("0xdeadbeef"),
    ...overrides,
  };
}

function runConfirmationPathTests() {
  const now = Date.now();
  const highRiskBody = {
    action: "reduce_exposure",
    riskScore: 70,
    simulationStatus: "passed",
  };

  // 1. High-risk trade without simulation object -> 403
  const r1 = simulateConfirmRoute({
    ...highRiskBody,
    simulation: undefined,
    currentBlockNumber: 1000,
  });
  assert(r1.status === 403, "High-risk without simulation object must return 403.");

  // 2. High-risk trade with null simulation -> 403
  const r2 = simulateConfirmRoute({
    ...highRiskBody,
    simulation: null as unknown as undefined,
    currentBlockNumber: 1000,
  });
  assert(r2.status === 403, "High-risk with null simulation must return 403.");

  // 3. High-risk trade with "passed" but missing simulation object -> 403
  const r3 = simulateConfirmRoute({
    ...highRiskBody,
    simulation: undefined,
    currentBlockNumber: 1000,
  });
  assert(r3.status === 403, "High-risk passed status without simulation data must return 403.");

  // 4. High-risk without block/ledger -> 403
  const r4 = simulateConfirmRoute({
    ...highRiskBody,
    simulation: buildSim(),
  });
  assert(r4.status === 403, "High-risk without current block/ledger must return 403.");

  // 5. Amount mismatch -> 403
  const r5 = simulateConfirmRoute({
    ...highRiskBody,
    simulation: buildSim(),
    currentBlockNumber: 1000,
    currentCalldata: "0xdeadbeef",
    currentFromAmount: "200",
    currentRoute: ["USDC", "ETH"],
    currentSlippageBps: 100,
    currentSequenceNumber: 42,
    currentFee: "0.005 ETH",
  });
  assert(r5.status === 403, "Amount mismatch must return 403.");

  // 6. Route mismatch -> 403
  const r6 = simulateConfirmRoute({
    ...highRiskBody,
    simulation: buildSim(),
    currentBlockNumber: 1000,
    currentCalldata: "0xdeadbeef",
    currentFromAmount: "100",
    currentRoute: ["USDC", "BTC"],
    currentSlippageBps: 100,
    currentSequenceNumber: 42,
    currentFee: "0.005 ETH",
  });
  assert(r6.status === 403, "Route mismatch must return 403.");

  // 7. Slippage mismatch -> 403
  const r7 = simulateConfirmRoute({
    ...highRiskBody,
    simulation: buildSim(),
    currentBlockNumber: 1000,
    currentCalldata: "0xdeadbeef",
    currentFromAmount: "100",
    currentRoute: ["USDC", "ETH"],
    currentSlippageBps: 200,
    currentSequenceNumber: 42,
    currentFee: "0.005 ETH",
  });
  assert(r7.status === 403, "Slippage mismatch must return 403.");

  // 8. Sequence mismatch -> 403
  const r8 = simulateConfirmRoute({
    ...highRiskBody,
    simulation: buildSim(),
    currentBlockNumber: 1000,
    currentCalldata: "0xdeadbeef",
    currentFromAmount: "100",
    currentRoute: ["USDC", "ETH"],
    currentSlippageBps: 100,
    currentSequenceNumber: 99,
    currentFee: "0.005 ETH",
  });
  assert(r8.status === 403, "Sequence mismatch must return 403.");

  // 9. Fee mismatch -> 403
  const r9 = simulateConfirmRoute({
    ...highRiskBody,
    simulation: buildSim(),
    currentBlockNumber: 1000,
    currentCalldata: "0xdeadbeef",
    currentFromAmount: "100",
    currentRoute: ["USDC", "ETH"],
    currentSlippageBps: 100,
    currentSequenceNumber: 42,
    currentFee: "0.01 ETH",
  });
  assert(r9.status === 403, "Fee mismatch must return 403.");

  // 10. Calldata mismatch -> 403
  const r10 = simulateConfirmRoute({
    ...highRiskBody,
    currentCalldata: "0xdeadbeef",
    simulation: buildSim({ calldataHash: hashCalldata("0xbadc0de") }),
    currentBlockNumber: 1000,
    currentFromAmount: "100",
    currentRoute: ["USDC", "ETH"],
    currentSlippageBps: 100,
    currentSequenceNumber: 42,
    currentFee: "0.005 ETH",
  });
  assert(r10.status === 403, "Calldata mismatch must return 403.");

  // 11. Stale block age -> 403
  const r11 = simulateConfirmRoute({
    ...highRiskBody,
    simulation: buildSim({ blockNumber: 800 }),
    currentBlockNumber: 1000,
    currentFromAmount: "100",
    currentRoute: ["USDC", "ETH"],
    currentSlippageBps: 100,
    currentSequenceNumber: 42,
    currentFee: "0.005 ETH",
  });
  assert(r11.status === 403, "Stale block age must return 403.");

  // 12. Stale elapsed time -> 403
  const r12 = simulateConfirmRoute({
    ...highRiskBody,
    simulation: buildSim({ simulatedAt: new Date(now - 600_000).toISOString() }),
    currentBlockNumber: 1000,
    currentFromAmount: "100",
    currentRoute: ["USDC", "ETH"],
    currentSlippageBps: 100,
    currentSequenceNumber: 42,
    currentFee: "0.005 ETH",
  });
  assert(r12.status === 403, "Stale elapsed time must return 403.");

  // 13. Unsupported status -> 403
  const r13 = simulateConfirmRoute({
    ...highRiskBody,
    simulationStatus: "unsupported",
    simulation: buildSim({ status: "unsupported" }),
    currentBlockNumber: 1000,
  });
  assert(r13.status === 403, "Unsupported status must return 403 in confirm route.");

  // 14. Failed status -> 403
  const r14 = simulateConfirmRoute({
    ...highRiskBody,
    simulationStatus: "failed",
    simulation: buildSim({ status: "failed" }),
    currentBlockNumber: 1000,
  });
  assert(r14.status === 403, "Failed status must return 403.");

  // 15. Low-risk trade (watch) -> 200 (no simulation validation)
  const r15 = simulateConfirmRoute({
    action: "watch",
    riskScore: 80,
    simulationStatus: "not_required",
    simulation: undefined,
  });
  assert(r15.status === 200, "Low-risk watch must pass without simulation.");

  // 16. Low-risk hold -> 200
  const r16 = simulateConfirmRoute({
    action: "hold",
    riskScore: 90,
    simulationStatus: "not_required",
    simulation: undefined,
  });
  assert(r16.status === 200, "Low-risk hold must pass without simulation.");

  // 17. High-risk with all correct params passes -> 200
  const r17 = simulateConfirmRoute({
    ...highRiskBody,
    simulation: buildSim(),
    currentBlockNumber: 1000,
    currentCalldata: "0xdeadbeef",
    currentFromAmount: "100",
    currentRoute: ["USDC", "ETH"],
    currentSlippageBps: 100,
    currentSequenceNumber: 42,
    currentFee: "0.005 ETH",
  });
  assert(r17.status === 200, "All params matching must pass high-risk validation.");

  // 18. Sim field bound but current absent (fail-closed)
  const r18 = simulateConfirmRoute({
    ...highRiskBody,
    simulation: buildSim({ fromAmount: "100" }),
    currentBlockNumber: 1000,
    currentCalldata: "0xdeadbeef",
    currentFromAmount: undefined,
    currentRoute: ["USDC", "ETH"],
    currentSlippageBps: 100,
    currentSequenceNumber: 42,
    currentFee: "0.005 ETH",
  });
  assert(r18.status === 403, "Sim has fromAmount but current doesn't -> 403 (fail-closed).");

  // 19. Sim has route but current doesn't -> fail-closed
  const r19 = simulateConfirmRoute({
    ...highRiskBody,
    simulation: buildSim({ route: ["USDC", "ETH"] }),
    currentBlockNumber: 1000,
    currentCalldata: "0xdeadbeef",
    currentFromAmount: "100",
    currentRoute: undefined,
    currentSlippageBps: 100,
    currentSequenceNumber: 42,
    currentFee: "0.005 ETH",
  });
  assert(r19.status === 403, "Sim has route but current doesn't -> 403 (fail-closed).");

  // 20. Sim has fee but current doesn't -> fail-closed
  const r20 = simulateConfirmRoute({
    ...highRiskBody,
    simulation: buildSim({ fee: "0.005 ETH" }),
    currentBlockNumber: 1000,
    currentCalldata: "0xdeadbeef",
    currentFromAmount: "100",
    currentRoute: ["USDC", "ETH"],
    currentSlippageBps: 100,
    currentSequenceNumber: 42,
    currentFee: undefined,
  });
  assert(r20.status === 403, "Sim has fee but current doesn't -> 403 (fail-closed).");

  // 21. Expired quote -> 403
  const r21 = simulateConfirmRoute({
    ...highRiskBody,
    simulation: buildSim({ quoteExpiry: new Date(now - 60_000).toISOString() }),
    currentBlockNumber: 1000,
    currentFromAmount: "100",
    currentRoute: ["USDC", "ETH"],
    currentSlippageBps: 100,
    currentSequenceNumber: 42,
    currentFee: "0.005 ETH",
  });
  assert(r21.status === 403, "Expired quote must return 403.");

  // 22. Missing simulation timestamp -> 403
  const r22 = simulateConfirmRoute({
    ...highRiskBody,
    simulation: buildSim({ simulatedAt: undefined }),
    currentBlockNumber: 1000,
    currentFromAmount: "100",
    currentRoute: ["USDC", "ETH"],
    currentSlippageBps: 100,
    currentSequenceNumber: 42,
    currentFee: "0.005 ETH",
  });
  assert(r22.status === 403, "Missing simulation timestamp must return 403.");

  // 23. Mismatched txHash -> rejected (Finding 1)
  const r23 = simulateConfirmRoute({
    ...highRiskBody,
    txHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    simulation: buildSim(),
    currentBlockNumber: 1000,
    currentFromAmount: "100",
    currentRoute: ["USDC", "ETH"],
    currentSlippageBps: 100,
    currentSequenceNumber: 42,
    currentFee: "0.005 ETH",
  });
  assert(r23.status === 403, "Mismatched txHash must return 403.");

  // 24. Simulation missing a recorded param (e.g. no fromAmount) while current
  //     params include one -> rejected, not silently passed (Finding 2)
  const r24 = simulateConfirmRoute({
    ...highRiskBody,
    simulation: buildSim({ fromAmount: undefined }),
    currentBlockNumber: 1000,
    currentFromAmount: "100",
    currentRoute: ["USDC", "ETH"],
    currentSlippageBps: 100,
    currentSequenceNumber: 42,
    currentFee: "0.005 ETH",
  });
  assert(r24.status === 403, "Sim missing fromAmount while current has one -> must return 403 (fail-closed).");

  // 25. Mismatched XDR on Stellar high-risk -> rejected (Finding 3)
  const r25 = simulateConfirmRoute({
    ...highRiskBody,
    isStellar: true,
    stellarEnvelopeXdr: "mismatched_xdr",
    simulation: buildSim({ simulatedXdrHash: "expected_xdr" }),
    currentLedgerSeq: 500,
    currentFromAmount: "100",
    currentRoute: ["USDC", "ETH"],
    currentSlippageBps: 100,
    currentSequenceNumber: 42,
    currentFee: "0.005 ETH",
  });
  assert(r25.status === 403, "Mismatched XDR on Stellar high-risk must return 403.");

  // 26. Stellar high-risk with XDR provided but simulation missing
  //     simulatedXdrHash -> rejected (Finding 3)
  const r26 = simulateConfirmRoute({
    ...highRiskBody,
    isStellar: true,
    stellarEnvelopeXdr: "some_xdr",
    simulation: buildSim({ simulatedXdrHash: undefined }),
    currentLedgerSeq: 500,
    currentFromAmount: "100",
    currentRoute: ["USDC", "ETH"],
    currentSlippageBps: 100,
    currentSequenceNumber: 42,
    currentFee: "0.005 ETH",
  });
  assert(r26.status === 403, "Stellar high-risk with XDR but sim missing simulatedXdrHash must return 403.");

  // 27. Missing currentCalldata on EVM high-risk -> rejected, not silently
  //     passed via self-comparison (Finding 4)
  const r27 = simulateConfirmRoute({
    ...highRiskBody,
    simulation: buildSim(),
    currentBlockNumber: 1000,
    currentFromAmount: "100",
    currentRoute: ["USDC", "ETH"],
    currentSlippageBps: 100,
    currentSequenceNumber: 42,
    currentFee: "0.005 ETH",
  });
  assert(r27.status === 403, "Missing currentCalldata on EVM high-risk must return 403.");

  // 28. Stellar transaction supplying only currentBlockNumber (no
  //     currentLedgerSeq) -> rejected (Finding 5)
  const r28 = simulateConfirmRoute({
    ...highRiskBody,
    isStellar: true,
    simulation: buildSim({ ledgerSeq: 500 }),
    currentBlockNumber: 1050,
    currentLedgerSeq: undefined,
    currentFromAmount: "100",
    currentRoute: ["USDC", "ETH"],
    currentSlippageBps: 100,
    currentSequenceNumber: 42,
    currentFee: "0.005 ETH",
  });
  assert(r28.status === 403, "Stellar with only currentBlockNumber must return 403.");

  // 29. EVM transaction supplying only currentLedgerSeq (no
  //     currentBlockNumber) -> rejected (Finding 5)
  const r29 = simulateConfirmRoute({
    ...highRiskBody,
    isStellar: false,
    simulation: buildSim({ blockNumber: 1000 }),
    currentBlockNumber: undefined,
    currentLedgerSeq: 1050,
    currentFromAmount: "100",
    currentRoute: ["USDC", "ETH"],
    currentSlippageBps: 100,
    currentSequenceNumber: 42,
    currentFee: "0.005 ETH",
  });
  assert(r29.status === 403, "EVM with only currentLedgerSeq must return 403.");

  console.log("All 29 confirmation-path tests passed.");
}

runConfirmationPathTests();
