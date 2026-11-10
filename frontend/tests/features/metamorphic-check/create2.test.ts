import { describe, expect, it } from "vitest";
import { analyzeInitCode, isCreate2Deployment, type CreationEvidence } from "@/server/research/metamorphic-check";
import metamorphic from "./data/metamorphic-factory.json";

describe("create2 and initCodePatterns", () => {
  it("identifies CREATE2 deployments and EXTCODECOPY loader init code", () => {
    expect(isCreate2Deployment(metamorphic.creation as CreationEvidence)).toBe(true);
    const patterns = analyzeInitCode(metamorphic.creation.initCodeHex);
    expect(patterns.externalCodeCopyInInit).toBe(true);
    expect(patterns.dynamicRuntimeLoader).toBe(true);
  });
});
