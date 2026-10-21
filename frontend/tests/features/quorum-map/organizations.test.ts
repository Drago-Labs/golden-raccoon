import { describe, expect, it } from "vitest";
import { unresolvedKeys, type ValidatorNode } from "@/server/research/quorum-map/organizationMap";
import { parseQuorumSet } from "@/server/research/quorum-map/quorumParser";
import { compareToml } from "@/server/research/quorum-map/tomlValidators";
import { mismatchFixture, nestedFixture } from "./fixtures";

function nodesFrom(fixture: typeof nestedFixture): ValidatorNode[] {
  return fixture.nodes.map((node) => ({
    publicKey: node.publicKey,
    organization: node.organization,
    homeDomain: node.homeDomain,
    quorumSet: parseQuorumSet(node.quorumSet).set,
  }));
}

describe("organization mapping", () => {
  it("keeps a key with no node record as unresolved", () => {
    const unresolved = unresolvedKeys(nodesFrom(nestedFixture));
    expect(unresolved).toHaveLength(1);
    expect(nestedFixture.nodes.some((node) => node.publicKey === unresolved[0])).toBe(false);
  });

  it("flags a home-domain disagreement and a node missing from toml", () => {
    const rows = compareToml(nodesFrom(mismatchFixture), mismatchFixture.toml);
    expect(rows.map((row) => row.field).sort()).toEqual(["home_domain", "missing_toml"]);
    expect(rows.find((row) => row.field === "home_domain")?.tomlValue).toBe("other.example");
  });
});
