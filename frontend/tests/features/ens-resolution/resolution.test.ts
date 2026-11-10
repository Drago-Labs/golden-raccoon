import { describe, expect, it } from "vitest";
import { extractForwardStep, extractOwnershipEvidence, extractReverseStep } from "@/server/research/ens-resolution";
import verified from "./data/verified-pair.json";

describe("forward, reverse, and ownership extraction", () => {
  it("extracts resolution steps and ownership expiry state at the recorded block", () => {
    const fwd = extractForwardStep(verified);
    const rev = extractReverseStep(verified);
    const own = extractOwnershipEvidence(verified);
    expect(fwd.forwardAddress).toBe("0x1111111111111111111111111111111111111111");
    expect(rev.reverseName).toBe("alice.eth");
    expect(own.expiredAtRecordedTime).toBe(false);
  });
});
