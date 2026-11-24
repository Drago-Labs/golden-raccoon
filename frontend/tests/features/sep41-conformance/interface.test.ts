import { describe, expect, it } from "vitest";
import { diffInterface } from "@/server/research/sep41-conformance/interfaceDiff";
import { fixtures } from "./fixtures";

describe("sep41 interfaceDiff", () => {
  it("matches the conforming fixture spec exactly", () => {
    const diff = diffInterface(fixtures.conforming.functions ?? []);
    expect(diff.every((entry) => entry.kind === "match")).toBe(true);
    expect(diff.map((entry) => entry.name)).toEqual([
      "allowance",
      "approve",
      "balance",
      "transfer",
      "transfer_from",
      "burn",
      "burn_from",
      "decimals",
      "name",
      "symbol",
    ]);
  });

  it("reports missing and extra functions from the missing-functions fixture", () => {
    const diff = diffInterface(fixtures.missing.functions ?? []);
    const missing = diff.filter((entry) => entry.kind === "missing").map((entry) => entry.name);
    const extra = diff.filter((entry) => entry.kind === "extra").map((entry) => entry.name);

    expect(missing).toEqual(
      expect.arrayContaining(["allowance", "approve", "transfer_from", "burn", "burn_from"]),
    );
    expect(extra).toContain("custom_mint");
    expect(diff.find((entry) => entry.name === "balance")?.kind).toBe("match");
  });

  it("flags mismatched argument types", () => {
    const diff = diffInterface([
      {
        name: "balance",
        inputs: [{ name: "id", type: "String" }],
        outputs: [{ name: "", type: "i128" }],
      },
    ]);
    const balance = diff.find((entry) => entry.name === "balance");
    expect(balance?.kind).toBe("mismatched");
    expect(balance?.detail).toContain("inputs");
  });
});
