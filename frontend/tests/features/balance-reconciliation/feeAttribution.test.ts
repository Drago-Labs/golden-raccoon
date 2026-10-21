import { describe, expect, it } from "vitest";
import { attributeFees } from "@/server/research/balance-reconciliation/feeAttribution";
import { feeBumpFixture } from "./fixtures";

describe("fee attribution", () => {
  it("charges a fee-bump fee to the sponsor and not the inner account", () => {
    const [transaction] = feeBumpFixture.transactions;
    const fee = {
      hash: transaction!.hash,
      ledger: transaction!.ledger,
      feeChargedStroops: transaction!.fee_charged,
      feeAccount: transaction!.fee_account,
      sourceAccount: transaction!.source_account,
      feeBump: transaction!.fee_bump,
    };

    expect(attributeFees([fee], feeBumpFixture.account)).toEqual([
      expect.objectContaining({ asset: "native", stroops: -300n, feeAccount: feeBumpFixture.account, category: "fee" }),
    ]);
    expect(attributeFees([fee], feeBumpFixture.inner_account ?? "")).toEqual([]);
    expect(fee.feeAccount).not.toBe(fee.sourceAccount);
  });
});
