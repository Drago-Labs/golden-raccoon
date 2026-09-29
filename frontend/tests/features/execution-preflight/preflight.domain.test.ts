import { describe, expect, it } from "vitest";
import { analysePreflight } from "@/server/research/execution-preflight/service";
import {
  evmComplete,
  insufficientReserve,
  maxSlippage,
  networkMismatch,
  overflowAmount,
  planHashMismatch,
  staleSimulation,
  stellarComplete,
  unavailableFee,
} from "./fixtures";

describe("execution preflight", () => {
  it("distinguishes Stellar base and resource fees", () => {
    const report = analysePreflight(stellarComplete);
    expect(report.rows.some((row) => row.rowId === "stellar-base-fee")).toBe(true);
    expect(report.rows.some((row) => row.rowId === "stellar-resource-fee")).toBe(true);
    expect(report.rows.some((row) => row.rowId === "evm-gas")).toBe(false);
    expect(report.coverage.safeToPresentAsComplete).toBe(true);
    expect(report.neverSignsOrSends).toBe(true);
  });

  it("distinguishes EVM gas fees", () => {
    const report = analysePreflight(evmComplete);
    expect(report.rows.some((row) => row.rowId === "evm-gas")).toBe(true);
    expect(report.rows.some((row) => row.rowId === "stellar-base-fee")).toBe(false);
    expect(report.coverage.state).toBe("complete");
  });

  it("blocks complete claims on stale simulation", () => {
    const report = analysePreflight(staleSimulation);
    expect(report.blockers.some((blocker) => blocker.code === "stale_simulation")).toBe(true);
    expect(report.coverage.safeToPresentAsComplete).toBe(false);
    expect(report.coverage.state).toBe("unsafe");
  });

  it("blocks on network mismatch", () => {
    const report = analysePreflight(networkMismatch);
    expect(report.blockers.some((blocker) => blocker.code === "network_mismatch")).toBe(true);
  });

  it("blocks on plan hash mismatch", () => {
    const report = analysePreflight(planHashMismatch);
    expect(report.blockers.some((blocker) => blocker.code === "plan_hash_mismatch")).toBe(true);
  });

  it("detects insufficient reserve", () => {
    const report = analysePreflight(insufficientReserve);
    expect(report.blockers.some((blocker) => blocker.code === "insufficient_reserve")).toBe(true);
  });

  it("detects maximum slippage breaches", () => {
    const report = analysePreflight(maxSlippage);
    expect(report.blockers.some((blocker) => blocker.code === "max_slippage")).toBe(true);
  });

  it("refuses complete when fee estimate is unavailable", () => {
    const report = analysePreflight(unavailableFee);
    expect(report.blockers.some((blocker) => blocker.code === "unavailable_fee")).toBe(true);
    expect(report.coverage.safeToPresentAsComplete).toBe(false);
  });

  it("flags overflow / precision hazards", () => {
    const report = analysePreflight(overflowAmount);
    expect(report.blockers.some((blocker) => blocker.code === "overflow")).toBe(true);
  });
});
