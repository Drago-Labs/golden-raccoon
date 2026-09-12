export function validateLiabilities(balanceStroops: bigint, sellingLiabilitiesStroops: bigint) {
  if (balanceStroops < 0n || sellingLiabilitiesStroops < 0n) throw new Error("Negative balance or liability is invalid");
  return { balanceStroops, sellingLiabilitiesStroops };
}

export function remainingAfterLiabilities(balanceStroops: bigint, sellingLiabilitiesStroops: bigint) {
  return balanceStroops > sellingLiabilitiesStroops ? balanceStroops - sellingLiabilitiesStroops : 0n;
}
