import { StrKey } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { decodeLedgerKey } from "@/server/research/storage-lifetime/ledgerKeyDecoder";
import { storageRequestSchema } from "@/server/research/storage-lifetime/schema";
import { contractDataKey, contractId, validRequest } from "./fixtures";

describe("storage footprint validation", () => {
  it("rejects duplicate, oversized, and cross-network input", () => {
    const { encoded } = contractDataKey();
    expect(storageRequestSchema.safeParse(validRequest([encoded, encoded])).success).toBe(false);
    expect(storageRequestSchema.safeParse(validRequest(Array.from({ length: 41 }, (_, i) => `${encoded}${i}`))).success).toBe(false);
    expect(storageRequestSchema.safeParse({ ...validRequest([encoded]), walletNetwork: "stellar-pubnet" }).success).toBe(false);
  });

  it("rejects malformed XDR before any reader is needed", () => {
    expect(storageRequestSchema.safeParse(validRequest(["not-xdr"])).success).toBe(false);
    expect(() => decodeLedgerKey("not-xdr", contractId)).toThrow("Malformed ledger-key XDR");
  });

  it("rejects contract-data keys scoped to a different contract", () => {
    const { encoded } = contractDataKey();
    const other = StrKey.encodeContract(Buffer.alloc(32, 8));
    expect(() => decodeLedgerKey(encoded, other)).toThrow("another contract");
  });
});
