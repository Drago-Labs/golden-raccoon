import { describe, expect, it } from "vitest";
import { consistencyRequestSchema, CONSISTENCY_SCHEMA_VERSION } from "@/server/research/rpc-consistency/schema";
import { ACCOUNT, CONTRACT } from "./fixtures";

describe("schema", () => {
  it("accepts an account on testnet and a contract on mainnet", () => {
    expect(consistencyRequestSchema.parse({ network: "testnet", target: ACCOUNT }).network).toBe("testnet");
    expect(
      consistencyRequestSchema.parse({ network: "mainnet", target: CONTRACT, contractDataKeys: ["counter"] }).contractDataKeys,
    ).toEqual(["counter"]);
  });

  it("rejects an unnamed network and a missing target", () => {
    expect(consistencyRequestSchema.safeParse({ network: "futurenet", target: ACCOUNT }).success).toBe(false);
    expect(consistencyRequestSchema.safeParse({ network: "testnet" }).success).toBe(false);
  });

  it("publishes a schema version", () => {
    expect(CONSISTENCY_SCHEMA_VERSION).toBe("rpc-consistency/2026-10");
  });
});
