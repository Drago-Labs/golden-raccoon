import type { AuthorizationRecord } from "./schema";
export type RawAuthorization = { transactionHash: string; blockNumber: number; address: string; nonce?: string };
export function buildAuthorizationHistory(rows: RawAuthorization[]): AuthorizationRecord[] {
  return rows.map((row) => ({ transactionHash: row.transactionHash, blockNumber: row.blockNumber, target: row.address, revoked: /^0x0{40}$/i.test(row.address) })).sort((a, b) => b.blockNumber - a.blockNumber);
}
