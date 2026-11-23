import { describe, expect, it } from "vitest";
import { buildCoverage } from "@/server/research/treasury-flows/coverage";
import { compareReported } from "@/server/research/treasury-flows/reportedFigures";
import { analyseTreasury } from "@/server/research/treasury-flows/service";
import { readTreasuryAddresses } from "@/server/research/treasury-flows/treasuryRegistry";
import { loadFixture } from "./fixtures";
describe("reported figures are compared with their cited source", () => {
  it("marks 90 against an observed 80 as a mismatch and keeps the source", () => {
    const result = analyseTreasury(loadFixture("reported-mismatch.json"));
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.report.comparisons[0]).toMatchObject({ reported: "90", observed: "80", matches: false, source: "https://project.example/blog" });
    const balances = result.report.balances;
    expect(compareReported([{ asset: "USDC", chain: "stellar", reported: "80", source: "https://project.example/treasury" }], balances)[0].matches).toBe(true);
    const fixture = loadFixture("single-chain-treasury.json") as { addresses: unknown };
    expect(buildCoverage(readTreasuryAddresses(fixture.addresses)).notes.join(" ")).toMatch(/project.example/);
  });
});
