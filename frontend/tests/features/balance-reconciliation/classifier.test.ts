import { describe, expect, it } from "vitest";
import { assetKey } from "@/server/research/balance-reconciliation/assetIdentity";
import { classifyEffect } from "@/server/research/balance-reconciliation/effectClassifier";
import { matchedFixture } from "./fixtures";

const account = matchedFixture.account;

describe("effect classification", () => {
  it("separates credits, debits, and the same code from two issuers", () => {
    const keys = matchedFixture.effects
      .filter((effect) => effect.asset_code === "USD")
      .map((effect) => assetKey(effect));
    expect(new Set(keys).size).toBe(2);
    expect(keys[0]).not.toBe(keys[1]);
    expect(classifyEffect(matchedFixture.effects[0]!).movements[0]?.stroops).toBe(50_000_000n);
    expect(classifyEffect(matchedFixture.effects[1]!).movements[0]?.category).toBe("debit");
  });

  it("classifies trades, pools, claimable balances, clawbacks, and leaves unknown types out", () => {
    const trade = classifyEffect({
      id: "t", pagingToken: "t", type: "trade", ledger: 1, account, seller: account,
      sold_amount: "1.0000000", sold_asset_type: "native",
      bought_amount: "3.0000000", bought_asset_type: "credit_alphanum4", bought_asset_code: "USD", bought_asset_issuer: "GBUYERISSUER",
    });
    expect(trade.movements.map((movement) => movement.stroops)).toEqual([-10_000_000n, 30_000_000n]);
    expect(trade.movements[1]?.asset).toBe("USD:GBUYERISSUER");

    const pool = classifyEffect({
      id: "p", pagingToken: "p", type: "liquidity_pool_deposited", ledger: 1, account,
      reserves_deposited: [{ asset: "native", amount: "2.0000000" }],
    });
    expect(pool.movements[0]).toMatchObject({ category: "pool", stroops: -20_000_000n, asset: "native" });

    expect(classifyEffect({ id: "c", pagingToken: "c", type: "claimable_balance_created", ledger: 1, account, amount: "1.0000000", asset_type: "native" }).movements[0]?.category).toBe("claimable");
    expect(classifyEffect({ id: "k", pagingToken: "k", type: "claimable_balance_clawed_back", ledger: 1, account, amount: "1.0000000", asset_type: "native" }).movements[0]?.category).toBe("clawback");
    expect(classifyEffect({ id: "x", pagingToken: "x", type: "signer_created", ledger: 1, account }).unclassified).toEqual([{ id: "x", type: "signer_created" }]);
  });
});
