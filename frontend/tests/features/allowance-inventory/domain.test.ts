import { describe, expect, it } from "vitest";
import { buildAllowanceInventory } from "@/server/research/allowance-inventory";
import { FixtureRpc, approvalLog, finiteToken, maximumToken, rateLimitedLogs, revokedToken, spenderA, spenderB, walletA, walletB } from "./fixtures";

const request = { walletAddress: walletA, network: "ethereum" as const, fromBlock: 1n, toBlock: 1000n, pairs: [] };

describe("allowance inventory service", () => {
  it("reads finite, maximum and revoked current state at one snapshot", async () => {
    const rpc = new FixtureRpc();
    rpc.logsResult = [approvalLog(finiteToken, spenderA), approvalLog(maximumToken, spenderA), approvalLog(revokedToken, spenderB)];
    const result = await buildAllowanceInventory(request, { rpc, now: () => new Date("2026-01-01T00:00:00Z") });
    expect(result.entries.map((entry) => entry.allowanceKind)).toEqual(["finite", "maximum", "revoked"]);
    expect(result.entries.find((entry) => entry.token === revokedToken)?.allowance).toBe("0");
    expect(result.entries.find((entry) => entry.token === finiteToken)?.knownBalanceExposure).toBe("1000000");
    expect(result.state).toBe("complete");
  });

  it("keeps explicit reads but marks log rate limits partial", async () => {
    const rpc = new FixtureRpc();
    rpc.logError = rateLimitedLogs();
    const result = await buildAllowanceInventory({ ...request, pairs: [{ token: finiteToken, spender: spenderA }] }, { rpc });
    expect(result.entries).toHaveLength(1);
    expect(result.state).toBe("partial");
    expect(result.coverage.logCoverageComplete).toBe(false);
    expect(result.coverage.message).toContain("Do not treat");
  });

  it("marks a changed snapshot hash partial instead of publishing stable state", async () => {
    const rpc = new FixtureRpc();
    rpc.logsResult = [approvalLog(finiteToken, spenderA)];
    rpc.hashReads = ["0xold", "0xnew"];
    const result = await buildAllowanceInventory(request, { rpc });
    expect(result.coverage.reorgDetected).toBe(true);
    expect(result.state).toBe("partial");
  });

  it("uses only the requested wallet as the allowance owner", async () => {
    const rpc = new FixtureRpc();
    await buildAllowanceInventory({ ...request, walletAddress: walletB, pairs: [{ token: finiteToken, spender: spenderA }] }, { rpc });
    expect(rpc.allowanceOwners).toEqual([walletB]);
  });

  it("reports malformed standards as unavailable", async () => {
    const rpc = new FixtureRpc();
    rpc.malformedTokens.add(finiteToken);
    const result = await buildAllowanceInventory({ ...request, walletAddress: walletB, pairs: [{ token: finiteToken, spender: spenderA }] }, { rpc });
    expect(result.walletAddress).toBe(walletB);
    expect(result.entries[0].allowanceKind).toBe("unknown");
    expect(result.state).toBe("unavailable");
  });

  it("turns metadata rate limits into an explicit retryable partial state", async () => {
    const rpc = new FixtureRpc();
    rpc.rateLimitedMetadataTokens.add(finiteToken);
    const result = await buildAllowanceInventory({ ...request, pairs: [{ token: finiteToken, spender: spenderA }] }, { rpc });
    expect(result.state).toBe("partial");
    expect(result.entries[0].warnings.join(" ")).toContain("retry later");
    expect(result.coverage.providerLimitations).toContain("Token metadata reads were rate-limited; retry later");
  });
});
