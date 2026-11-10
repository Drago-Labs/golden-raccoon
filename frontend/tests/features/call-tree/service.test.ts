import { describe, expect, it } from "vitest";
import { traceCallTree, type RawInvocationMeta } from "@/server/research/call-tree";
import { depsFromMeta, TX_HASH } from "./fixtures";
import nestedCall from "./data/nested-call.json";
import noDiagnostics from "./data/no-diagnostics.json";

describe("traceCallTree service", () => {
  it("returns complete report for nested invocation with diagnostics", async () => {
    const report = await traceCallTree(
      { txHash: TX_HASH, network: "stellar-testnet" },
      depsFromMeta(nestedCall as unknown as RawInvocationMeta),
    );
    expect(report.state).toBe("complete");
    expect(report.roots[0]!.children).toHaveLength(1);
    expect(report.netMovements).toHaveLength(2);
  });

  it("returns partial report with clear notice when diagnostics are disabled", async () => {
    const report = await traceCallTree(
      { txHash: TX_HASH, network: "stellar-testnet" },
      depsFromMeta(noDiagnostics as unknown as RawInvocationMeta),
    );
    expect(report.state).toBe("partial");
    expect(report.diagnosticsEnabled).toBe(false);
    expect(report.roots).toHaveLength(1);
    expect(report.warnings[0]).toMatch(/Diagnostic events were not enabled/);
  });

  it("returns unavailable when provider fails", async () => {
    const report = await traceCallTree(
      { txHash: TX_HASH, network: "stellar-testnet" },
      {
        metaProvider: {
          async readInvocationMeta() {
            throw new Error("RPC down");
          },
        },
      },
    );
    expect(report.state).toBe("unavailable");
  });
});
