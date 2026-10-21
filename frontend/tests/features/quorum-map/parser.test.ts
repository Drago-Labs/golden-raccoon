import { describe, expect, it } from "vitest";
import { QuorumMapError } from "@/server/research/quorum-map/errors";
import { parseQuorumSet } from "@/server/research/quorum-map/quorumParser";
import { parseTomlValidators } from "@/server/research/quorum-map/tomlValidators";
import { nestedFixture } from "./fixtures";

describe("quorum parsing", () => {
  it("keeps a nested set and an unknown validator key", () => {
    const parsed = parseQuorumSet(nestedFixture.nodes[0]?.quorumSet);
    expect(parsed.truncated).toBe(false);
    expect(parsed.set.threshold).toBe(3);
    expect(parsed.set.innerSets[0]?.validators).toHaveLength(2);
    const known = new Set(nestedFixture.nodes.map((node) => node.publicKey));
    const unknown = parsed.set.innerSets[0]?.validators.find((key) => !known.has(key));
    expect(unknown).toBeTruthy();
  });

  it("rejects a set without a threshold and reads a validators table", () => {
    expect(() => parseQuorumSet({ validators: ["G"] })).toThrow(QuorumMapError);
    const key = nestedFixture.nodes[0]?.publicKey ?? "";
    const rows = parseTomlValidators(`[[VALIDATORS]]\nPUBLIC_KEY="${key}"\nHOME_DOMAIN="alpha.example"\n`, "https://alpha.example/.well-known/stellar.toml", null);
    expect(rows).toEqual([{ publicKey: key, homeDomain: "alpha.example", source: "https://alpha.example/.well-known/stellar.toml", fetchedAt: null }]);
  });
});
