import { describe, expect, it } from "vitest";
import { latestBalance, rebuildBalances } from "@/server/research/treasury-flows/balanceHistory";
import { readTreasuryAddresses } from "@/server/research/treasury-flows/treasuryRegistry";
import { parseProjectId } from "@/server/research/treasury-flows/projectInput";
import { analyseTreasury } from "@/server/research/treasury-flows/service";
import type { Checkpoint } from "@/server/research/treasury-flows/schema";
import { loadFixture } from "./fixtures";
describe("reconstructed balances follow the recorded checkpoints", () => {
  it("ends at 80 USDC after the second checkpoint", () => {
    const fixture = loadFixture("active-treasury.json") as { checkpoints: Checkpoint[]; addresses: unknown; projectId: string };
    const points = rebuildBalances(fixture.checkpoints);
    expect(latestBalance(points, "USDC", "stellar")).toBe("80");
    expect(points[0].amount).toBe("100");
    const result = analyseTreasury(loadFixture("active-treasury.json"));
    expect(result.kind).toBe("ready");
    if (result.kind === "ready") expect(result.report.balances[1].amount).toBe("80");
    expect(readTreasuryAddresses(fixture.addresses)[0].source).toMatch(/project.example/);
    expect(parseProjectId(fixture.projectId)).toBe("active-treasury");
  });
});
