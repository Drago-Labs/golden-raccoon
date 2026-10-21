import { describe, expect, it } from "vitest";
import { organizationDependencies } from "@/server/research/quorum-map/dependency";
import { parseQuorumSet } from "@/server/research/quorum-map/quorumParser";
import type { ValidatorNode } from "@/server/research/quorum-map/organizationMap";
import { mainnetFixture, nestedFixture } from "./fixtures";

function nodesFrom(fixture: typeof nestedFixture): ValidatorNode[] {
  return fixture.nodes.map((node) => ({
    publicKey: node.publicKey,
    organization: node.organization,
    homeDomain: node.homeDomain,
    quorumSet: parseQuorumSet(node.quorumSet).set,
  }));
}

describe("organization dependence", () => {
  it("counts nested top-level sets and the thresholds a removal breaks", () => {
    const rows = organizationDependencies(nodesFrom(nestedFixture));
    expect(rows.find((row) => row.organization === "Alpha")).toEqual({ organization: "Alpha", topLevelCount: 2, removalBreaks: 2 });
    expect(rows.find((row) => row.organization === "Beta")).toEqual({ organization: "Beta", topLevelCount: 2, removalBreaks: 1 });
  });

  it("counts the recorded mainnet snapshot without merging organizations", () => {
    const rows = organizationDependencies(nodesFrom(mainnetFixture));
    expect(rows.find((row) => row.organization === "Alpha")?.removalBreaks).toBe(3);
    expect(rows.find((row) => row.organization === "Beta")?.removalBreaks).toBe(1);
    expect(rows.find((row) => row.organization === "Alpha")?.topLevelCount).toBe(3);
  });
});
