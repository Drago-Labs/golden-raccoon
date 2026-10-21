"use client";

import { formatSharePercent } from "@/server/research/stellar-holders/concentration";
import type { SupplyReport } from "@/server/research/stellar-holders/schema";

/** Trustline, pool, and claimable supply, each as its own bucket. */
export function SupplyBuckets({ supply }: { supply: SupplyReport }) {
  return (
    <section aria-labelledby="supply-buckets-heading" data-testid="supply-buckets" className="space-y-3">
      <h2 id="supply-buckets-heading" className="text-sm font-semibold">
        Supply buckets
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <caption className="sr-only">Issued supply split across trustlines, liquidity pools, and claimable balances</caption>
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/50">
              <th scope="col" className="px-3 py-2 font-medium">Bucket</th>
              <th scope="col" className="px-3 py-2 font-medium">Amount</th>
              <th scope="col" className="px-3 py-2 font-medium">Share of issued</th>
            </tr>
          </thead>
          <tbody>
            {supply.buckets.map((bucket) => (
              <tr key={bucket.id} className="border-b border-white/5" data-testid={`bucket-${bucket.id}`}>
                <th scope="row" className="px-3 py-2 font-normal">{bucket.label}</th>
                <td className="px-3 py-2 tabular-nums">{bucket.amount}</td>
                <td className="px-3 py-2 tabular-nums">
                  {formatSharePercent(bucket.shareOfIssued)} ({bucket.shareOfIssued.numerator}/{bucket.shareOfIssued.denominator})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-white/55">
        Issued supply is {supply.issued}. Contract balances of {supply.contracts} stay outside these three buckets.
      </p>
    </section>
  );
}
