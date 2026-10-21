"use client";

import { formatSharePercent } from "@/server/research/stellar-holders/concentration";
import type { HolderRow } from "@/server/research/stellar-holders/schema";

const ROLE_LABELS: Record<HolderRow["role"], string> = {
  issuer: "Issuer",
  distribution: "Distribution",
  public: "Public float",
};

/**
 * Holder rows. The wrapper scrolls horizontally on narrow screens instead of
 * squeezing account ids into an unreadable column.
 */
export function HolderTable({ holders }: { holders: HolderRow[] }) {
  return (
    <div data-testid="holder-table-scroll" className="overflow-x-auto">
      <table data-testid="holder-table" className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <caption className="sr-only">Trustline holders, their role, balance, and share of supply</caption>
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/50">
            <th scope="col" className="px-3 py-2 font-medium">Account</th>
            <th scope="col" className="px-3 py-2 font-medium">Role</th>
            <th scope="col" className="px-3 py-2 font-medium">Balance</th>
            <th scope="col" className="px-3 py-2 font-medium">Share of accounts</th>
            <th scope="col" className="px-3 py-2 font-medium">Share of public float</th>
          </tr>
        </thead>
        <tbody>
          {holders.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-4 text-white/60">
                No positive trustline balances were observed.
              </td>
            </tr>
          ) : (
            holders.map((holder) => (
              <tr key={holder.accountId} className="border-b border-white/5">
                <th scope="row" className="px-3 py-2 font-mono text-xs font-normal">{holder.accountId}</th>
                <td className="px-3 py-2">{ROLE_LABELS[holder.role]}</td>
                <td className="px-3 py-2 tabular-nums">{holder.balance}</td>
                <td className="px-3 py-2 tabular-nums">{formatSharePercent(holder.shareOfAccounts)}</td>
                <td className="px-3 py-2 tabular-nums">
                  {holder.shareOfPublicFloat ? formatSharePercent(holder.shareOfPublicFloat) : "Outside public float"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
