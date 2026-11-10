import { describe, expect, it } from "vitest";
import { decodeArgumentList } from "@/server/research/call-tree";

describe("decodeArgumentList", () => {
  it("preserves argument names, ScVal types, and display strings", () => {
    const decoded = decodeArgumentList([{ name: "amount_in", type: "i128", value: "50000000" }]);
    expect(decoded).toEqual([{ name: "amount_in", type: "i128", displayValue: "50000000" }]);
  });
});
