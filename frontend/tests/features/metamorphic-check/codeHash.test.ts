import { describe, expect, it } from "vitest";
import { compareCodeHashes } from "@/server/research/metamorphic-check";
import metamorphic from "./data/metamorphic-factory.json";
import ordinary from "./data/ordinary-contract.json";

describe("compareCodeHashes", () => {
  it("flags historical code hash changes across blocks", () => {
    expect(compareCodeHashes(metamorphic.codeHashSamples).historicalCodeChangeDetected).toBe(true);
    expect(compareCodeHashes(ordinary.codeHashSamples).historicalCodeChangeDetected).toBe(false);
  });
});
