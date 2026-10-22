export type ClaimEligibility = {
  inTree: boolean;
  proofValid: boolean;
  fileReportedRootMatchesChain: boolean | null;
  alreadyClaimed: boolean | null;
  eligible: boolean;
  reason: string;
};

/**
 * Combines tree-membership, cryptographic proof validity, and the
 * on-chain claimed flag into one eligibility verdict. `proofValid` is the
 * only thing that can prove a claim real; `fileReportedRootMatchesChain`
 * is purely an informational sanity check (a tampered file can self-report
 * any root it likes) and never makes a claim eligible on its own. A root
 * mismatch — a proof that does not fold up to the on-chain root — always
 * blocks eligibility, regardless of anything else.
 */
export function assessClaimStatus(params: {
  inTree: boolean;
  proofValid: boolean;
  fileReportedRootMatchesChain: boolean | null;
  alreadyClaimed: boolean | null;
}): ClaimEligibility {
  const { inTree, proofValid, fileReportedRootMatchesChain, alreadyClaimed } = params;

  if (!inTree) {
    return { inTree, proofValid, fileReportedRootMatchesChain, alreadyClaimed, eligible: false, reason: "Address not found in the loaded tree file" };
  }

  if (!proofValid) {
    return {
      inTree,
      proofValid,
      fileReportedRootMatchesChain,
      alreadyClaimed,
      eligible: false,
      reason: "Proof does not fold up to the on-chain root — this entry cannot be trusted",
    };
  }

  if (alreadyClaimed === true) {
    return { inTree, proofValid, fileReportedRootMatchesChain, alreadyClaimed, eligible: false, reason: "Already claimed on-chain" };
  }

  if (alreadyClaimed === null) {
    return {
      inTree,
      proofValid,
      fileReportedRootMatchesChain,
      alreadyClaimed,
      eligible: true,
      reason: "Proof verified against the on-chain root; claimed status could not be read",
    };
  }

  return {
    inTree,
    proofValid,
    fileReportedRootMatchesChain,
    alreadyClaimed,
    eligible: true,
    reason: "Proof verified against the on-chain root and not yet claimed",
  };
}
