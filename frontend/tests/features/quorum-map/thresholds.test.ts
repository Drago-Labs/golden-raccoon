import { describe, expect, it } from "vitest";
import { parseQuorumSet } from "@/server/research/quorum-map/quorumParser";
import { removalBreaks, sliceAgrees } from "@/server/research/quorum-map/thresholds";
import { nestedFixture } from "./fixtures";

describe("quorum thresholds", () => {
  it("agrees when every member votes and breaks only when Alpha is removed", () => {
    const set = parseQuorumSet(nestedFixture.nodes[0]?.quorumSet).set;
    const alpha = new Set(nestedFixture.nodes.filter((node) => node.organization === "Alpha").map((node) => node.publicKey));
    const beta = new Set(nestedFixture.nodes.filter((node) => node.organization === "Beta").map((node) => node.publicKey));
    const organizationOf = (key: string) => (alpha.has(key) ? "Alpha" : beta.has(key) ? "Beta" : null);

    expect(sliceAgrees(set, () => true)).toBe(true);
    expect(removalBreaks(set, "Alpha", organizationOf)).toBe(true);
    expect(removalBreaks(set, "Beta", organizationOf)).toBe(false);
  });
});
