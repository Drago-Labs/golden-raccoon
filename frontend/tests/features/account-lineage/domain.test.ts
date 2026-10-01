import { describe, expect, it } from "vitest";
import { traceLineage } from "@/server/research/account-lineage/service";

const A = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const B = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBR3DW";
const C = "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCWNQ";

describe("account lineage", () => {
  it("stops at the hop limit and does not loop", () => {
    const report = traceLineage({
      account: A,
      hopLimit: 2,
      accounts: [
        { id: A, createdBy: B, sponsored: true, payments: [{ from: C, amount: "10", asset: "native", ledger: 1, kind: "payment" }] },
        { id: B, createdBy: A },
      ],
    });
    expect(report.hops).toHaveLength(2);
    expect(report.hops[0]).toMatchObject({ sponsored: true, creator: B });
    expect(report.cycle).toBe(false);
    expect(report.truncated).toBe(true);
  });

  it("labels a cycle when the walk returns to a seen account inside the limit", () => {
    const report = traceLineage({
      account: A,
      hopLimit: 5,
      accounts: [
        { id: A, createdBy: B },
        { id: B, createdBy: A },
      ],
    });
    expect(report.cycle).toBe(true);
    expect(report.hops.length).toBeLessThan(5);
  });

  it("labels missing history instead of calling the account a root", () => {
    const report = traceLineage({
      account: A,
      hopLimit: 3,
      accounts: [{ id: A, missing: true }],
      labels: [{ id: A, kind: "exchange", evidence: "stellar.toml" }],
    });
    expect(report.hops[0]).toMatchObject({ status: "missing", root: false, label: { kind: "exchange" } });
  });
});
