import { describe, expect, it } from "vitest";
import { normalizeClmmAddress } from "@/server/research/clmm-positions/addressInput";
import { coverageLines, coverageNotice } from "@/server/research/clmm-positions/coverage";
import { deploymentFor, listDeployments } from "@/server/research/clmm-positions/deployments";
import { ClmmPositionsError } from "@/server/research/clmm-positions/errors";
import { boundedPageSize, CLMM_POSITIONS_LIMITS } from "@/server/research/clmm-positions/limits";
import { isClosedPosition } from "@/server/research/clmm-positions/positionReader";
import { clmmPositionsRequestSchema } from "@/server/research/clmm-positions/schema";
import { ADDRESS, closedFixture } from "./fixtures";

describe("clmm supporting modules", () => {
  it("normalizes and rejects addresses", () => {
    expect(normalizeClmmAddress(ADDRESS.toLowerCase())).toBe(ADDRESS);
    expect(() => normalizeClmmAddress("not-an-address")).toThrow(ClmmPositionsError);
  });

  it("lists known deployments", () => {
    expect(listDeployments().length).toBeGreaterThanOrEqual(3);
    expect(deploymentFor("ethereum")?.npmAddress).toMatch(/^0x/);
    expect(deploymentFor("unknown")).toBeNull();
  });

  it("bounds page size and exposes limits", () => {
    expect(boundedPageSize(0)).toBe(1);
    expect(boundedPageSize(999)).toBe(CLMM_POSITIONS_LIMITS.maxPageSize);
    expect(CLMM_POSITIONS_LIMITS.timeoutMs).toBeGreaterThan(0);
  });

  it("builds coverage copy and notices", () => {
    expect(coverageNotice("complete", [])).toMatch(/Complete coverage/);
    expect(coverageNotice("partial", ["pool missing"])).toMatch(/Partial coverage/);
    expect(coverageLines({ state: "complete", positionSource: true, poolSource: true, deploymentLabel: "Uniswap v3 Ethereum" })).toHaveLength(4);
  });

  it("detects closed positions and validates schema", () => {
    expect(isClosedPosition(closedFixture.position!)).toBe(true);
    expect(clmmPositionsRequestSchema.safeParse({ address: ADDRESS, network: "ethereum" }).success).toBe(true);
    expect(clmmPositionsRequestSchema.safeParse({ address: "x", network: "ethereum" }).success).toBe(false);
  });
});
