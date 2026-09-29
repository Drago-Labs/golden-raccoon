export function authorityEvidence(admin: string | null) {
  return admin
    ? { address: admin, conclusion: "Observed ERC-1967 admin slot; control semantics require separate review." }
    : { address: null, conclusion: "Admin slot is empty; UUPS or other upgrade authority remains unknown." };
}
