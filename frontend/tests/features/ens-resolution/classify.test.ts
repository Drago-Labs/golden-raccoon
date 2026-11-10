import { describe, expect, it } from "vitest";
import {
  classifyEnsResolution,
  extractForwardStep,
  extractOwnershipEvidence,
  extractReverseStep,
} from "@/server/research/ens-resolution";
import verified from "./data/verified-pair.json";
import mismatched from "./data/mismatched-reverse.json";
import expired from "./data/expired-name.json";

describe("classifyEnsResolution", () => {
  it("classifies verified, mismatched, and expired pairs accurately", () => {
    expect(
      classifyEnsResolution({
        forward: extractForwardStep(verified),
        reverse: extractReverseStep(verified),
        ownership: extractOwnershipEvidence(verified),
      }),
    ).toBe("verified");

    expect(
      classifyEnsResolution({
        forward: extractForwardStep(mismatched),
        reverse: extractReverseStep(mismatched),
        ownership: extractOwnershipEvidence(mismatched),
      }),
    ).toBe("mismatched");

    expect(
      classifyEnsResolution({
        forward: extractForwardStep(expired),
        reverse: extractReverseStep(expired),
        ownership: extractOwnershipEvidence(expired),
      }),
    ).toBe("expired");
  });
});
