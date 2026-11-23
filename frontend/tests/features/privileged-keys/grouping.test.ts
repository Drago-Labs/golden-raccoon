import { describe, expect, it } from "vitest";
import { buildCoverage } from "@/server/research/privileged-keys/coverage";
import { groupByController } from "@/server/research/privileged-keys/grouping";
import type { Deployment, PrivilegeRecord } from "@/server/research/privileged-keys/schema";
import { loadFixture } from "./fixtures";

describe("one controller of many contracts is a single group", () => {
  it("counts both vault and token under 0xsafe", () => {
    const fixture = loadFixture("multisig-project.json") as { privileges: PrivilegeRecord[]; deployments: Deployment[] };
    const [group] = groupByController(fixture.privileges);
    expect(group.address).toBe("0xsafe");
    expect(group.contracts).toEqual(["0xvault", "0xtoken"]);
    expect(group.threshold).toBe(2);
    const coverage = buildCoverage(fixture.deployments, []);
    expect(coverage.contractsRead).toBe(2);
    expect(coverage.notes.join(" ")).toMatch(/No Soroban/);
  });
});
