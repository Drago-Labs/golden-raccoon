import { describe, expect, it } from "vitest";
import { FLAGGED_CODE_HASHES, matchFlaggedHashes } from "@/server/research/deployer-history/flaggedHashes";
import type { Deployment } from "@/server/research/deployer-history/schema";

const addr = "0x1111111111111111111111111111111111111111";

describe("matchFlaggedHashes", () => {
  it("matches a deployment whose code hash is in the configured list, and states the source", () => {
    const entry = FLAGGED_CODE_HASHES[0];
    const deployments: Deployment[] = [{ address: addr, blockNumber: 1, txHash: "0xa", codeHash: entry.codeHash }];

    const matches = matchFlaggedHashes(deployments);
    expect(matches).toEqual([{ address: addr, codeHash: entry.codeHash, source: entry.source, label: entry.label }]);
  });

  it("matches case-insensitively", () => {
    const entry = FLAGGED_CODE_HASHES[0];
    const deployments: Deployment[] = [{ address: addr, blockNumber: 1, txHash: "0xa", codeHash: entry.codeHash.toUpperCase() as `0x${string}` }];
    expect(matchFlaggedHashes(deployments)).toHaveLength(1);
  });

  it("returns no matches for an unlisted code hash", () => {
    const deployments: Deployment[] = [{ address: addr, blockNumber: 1, txHash: "0xa", codeHash: "0xnotflagged" }];
    expect(matchFlaggedHashes(deployments)).toEqual([]);
  });

  it("skips deployments with no code hash", () => {
    const deployments: Deployment[] = [{ address: addr, blockNumber: 1, txHash: "0xa", codeHash: null }];
    expect(matchFlaggedHashes(deployments)).toEqual([]);
  });

  it("every configured entry names a source", () => {
    for (const entry of FLAGGED_CODE_HASHES) {
      expect(entry.source.length).toBeGreaterThan(0);
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });
});
