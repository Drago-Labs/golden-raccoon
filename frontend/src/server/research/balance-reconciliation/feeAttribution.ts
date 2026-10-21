import type { BalanceCategory } from "./schema";

export type FeeTransaction = {
  hash: string;
  ledger: number;
  feeChargedStroops: string;
  feeAccount: string;
  sourceAccount: string;
  feeBump: boolean;
};

export type FeeMovement = {
  id: string;
  ledger: number;
  category: BalanceCategory;
  asset: "native";
  stroops: bigint;
  feeAccount: string;
};

/**
 * A fee is charged to `feeAccount`. For a fee bump that is the sponsor, not the inner source.
 */
export function attributeFees(transactions: FeeTransaction[], inspectedAccount: string): FeeMovement[] {
  return transactions
    .filter((transaction) => transaction.feeAccount === inspectedAccount)
    .map((transaction) => ({
      id: transaction.hash,
      ledger: transaction.ledger,
      category: "fee" as const,
      asset: "native" as const,
      stroops: -BigInt(transaction.feeChargedStroops),
      feeAccount: transaction.feeAccount,
    }));
}
