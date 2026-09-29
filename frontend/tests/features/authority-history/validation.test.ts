import { describe, expect, it } from "vitest";
import {
  authorityHistoryRequestSchema,
  AUTHORITY_LIMITS,
} from "@/server/research/authority-history/schema";
import { buildCoverage } from "@/server/research/authority-history/coverage";
import { contract, walletA } from "./fixtures";

describe("authority history validation", () => {
  it("rejects arbitrary networks, invalid contracts and unbounded ranges", () => {
    expect(
      authorityHistoryRequestSchema.safeParse({
        walletAddress: walletA,
        network: "custom",
        contractAddress: contract,
        fromBlock: "1",
        toBlock: "2",
      }).success,
    ).toBe(false);
    expect(
      authorityHistoryRequestSchema.safeParse({
        walletAddress: walletA,
        network: "ethereum",
        contractAddress: "0xbad",
        fromBlock: "1",
        toBlock: "2",
      }).success,
    ).toBe(false);
    expect(
      authorityHistoryRequestSchema.safeParse({
        walletAddress: walletA,
        network: "ethereum",
        contractAddress: contract,
        fromBlock: "1",
        toBlock: String(AUTHORITY_LIMITS.maxBlockSpan + 2n),
      }).success,
    ).toBe(false);
  });

  it("accepts a bounded ethereum scan", () => {
    const parsed = authorityHistoryRequestSchema.safeParse({
      walletAddress: walletA,
      network: "ethereum",
      contractAddress: contract,
      fromBlock: "1",
      toBlock: "1000",
    });
    expect(parsed.success).toBe(true);
  });

  it("distinguishes complete, empty, partial and unavailable coverage", () => {
    const base = {
      fromBlock: "1",
      toBlock: "2",
      snapshotBlock: "2",
      eventCount: 1,
      truncated: false,
      logCoverageComplete: true,
      reorgDetected: false,
      missingBlockHashes: 0,
      unsupportedModels: [] as string[],
      providerLimitations: [] as string[],
    };
    expect(buildCoverage(base).state).toBe("complete");
    expect(buildCoverage({ ...base, eventCount: 0 }).state).toBe("empty");
    expect(buildCoverage({ ...base, logCoverageComplete: false }).state).toBe("partial");
    expect(buildCoverage({ ...base, reorgDetected: true }).reconstructionValid).toBe(false);
    expect(buildCoverage({ ...base, snapshotBlock: null }).state).toBe("unavailable");
  });
});
