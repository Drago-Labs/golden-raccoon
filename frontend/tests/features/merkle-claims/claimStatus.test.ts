import { describe, expect, it } from "vitest";
import { assessClaimStatus } from "@/server/research/merkle-claims/claimStatus";

describe("assessClaimStatus", () => {
  it("is not eligible when the address is not in the tree", () => {
    const result = assessClaimStatus({ inTree: false, proofValid: false, fileReportedRootMatchesChain: null, alreadyClaimed: null });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/not found/i);
  });

  it("blocks eligibility on an invalid proof even when the file's self-reported root matches the chain", () => {
    const result = assessClaimStatus({ inTree: true, proofValid: false, fileReportedRootMatchesChain: true, alreadyClaimed: false });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/does not fold up/i);
  });

  it("is not eligible when already claimed, even with a valid proof", () => {
    const result = assessClaimStatus({ inTree: true, proofValid: true, fileReportedRootMatchesChain: true, alreadyClaimed: true });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/already claimed/i);
  });

  it("is eligible with a valid proof and a confirmed unclaimed status", () => {
    const result = assessClaimStatus({ inTree: true, proofValid: true, fileReportedRootMatchesChain: true, alreadyClaimed: false });
    expect(result.eligible).toBe(true);
  });

  it("is still eligible (with a caveat reason) when the claimed status could not be read", () => {
    const result = assessClaimStatus({ inTree: true, proofValid: true, fileReportedRootMatchesChain: true, alreadyClaimed: null });
    expect(result.eligible).toBe(true);
    expect(result.reason).toMatch(/could not be read/i);
  });

  it("does not let a mismatched self-reported root alone block eligibility when the cryptographic proof is valid", () => {
    const result = assessClaimStatus({ inTree: true, proofValid: true, fileReportedRootMatchesChain: false, alreadyClaimed: false });
    expect(result.eligible).toBe(true);
  });
});
