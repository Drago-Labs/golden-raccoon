import { describe, expect, it } from "vitest";
import { normalizeEnsName } from "@/server/research/ens-resolution";

describe("normalizeEnsName", () => {
  it("lowercases and normalizes valid ENS names and rejects malformed labels", () => {
    expect(normalizeEnsName("  Alice.ETH ")).toBe("alice.eth");
    expect(() => normalizeEnsName("invalid")).toThrow(/invalid ens name/i);
  });
});
