import type { CirculatingSupplyRequest } from "./schema";
export function tokenIdentity(token: CirculatingSupplyRequest["token"]): string {
  return token.network === "evm" ? `${token.chainId}:${token.address.toLowerCase()}` : `${token.assetCode.toUpperCase()}:${token.issuer}`;
}
export function normalizeHolder(token: CirculatingSupplyRequest["token"], address: string): string {
  return token.network === "evm" ? address.toLowerCase() : address.toUpperCase();
}
