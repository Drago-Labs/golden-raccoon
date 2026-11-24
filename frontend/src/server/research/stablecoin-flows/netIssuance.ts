import { decimalFromUnits } from "./normalization";
import type { DailyFlow, NetIssuance } from "./schema";

function total(rows: DailyFlow[], canonicalDecimals: number): NetIssuance {
  const mint = rows.reduce((sum, row) => sum + BigInt(row.mintUnits), 0n);
  const burn = rows.reduce((sum, row) => sum + BigInt(row.burnUnits), 0n);
  const net = mint - burn;
  return {
    mintUnits: mint.toString(),
    burnUnits: burn.toString(),
    netUnits: net.toString(),
    mint: decimalFromUnits(mint, canonicalDecimals),
    burn: decimalFromUnits(burn, canonicalDecimals),
    net: decimalFromUnits(net, canonicalDecimals),
    eventCount: rows.reduce((sum, row) => sum + row.eventCount, 0),
  };
}

/** Net issuance across the window: minted minus burned, from the daily rows. */
export function netIssuance(daily: DailyFlow[], canonicalDecimals: number): NetIssuance {
  return total(daily, canonicalDecimals);
}

/** The same figure per chain, so a chain that minted is not hidden by one that burned. */
export function netIssuanceByChain(
  daily: DailyFlow[],
  canonicalDecimals: number,
): Array<NetIssuance & { chain: string }> {
  const chains = [...new Set(daily.map((row) => row.chain))].sort();
  return chains.map((chain) => ({
    chain,
    ...total(
      daily.filter((row) => row.chain === chain),
      canonicalDecimals,
    ),
  }));
}
