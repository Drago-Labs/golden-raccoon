import { beforeEach, describe, expect, it } from "vitest";
import {
  mintNonce,
  peekNonce,
  pruneExpiredNonces,
  resetNonceStore,
  verifyAndConsumeNonce,
} from "../nonce";

describe("Unified Single-Use Nonce Store", () => {
  beforeEach(() => {
    resetNonceStore();
  });

  it("mints and verifies an EVM challenge nonce", () => {
    const record = mintNonce({
      walletAddress: "0x1111111111111111111111111111111111111111",
      family: "evm",
      ttlSeconds: 300,
    });

    expect(record.nonce).toBeDefined();
    expect(record.family).toBe("evm");

    const result = verifyAndConsumeNonce({
      nonce: record.nonce,
      walletAddress: "0x1111111111111111111111111111111111111111",
      family: "evm",
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("valid");
    expect(result.record?.usedAt).toBeDefined();
  });

  it("mints and verifies a Stellar challenge nonce", () => {
    const stellarAddress = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
    const record = mintNonce({
      walletAddress: stellarAddress,
      family: "stellar",
      ttlSeconds: 300,
    });

    const result = verifyAndConsumeNonce({
      nonce: record.nonce,
      walletAddress: stellarAddress,
      family: "stellar",
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("valid");
  });

  it("refuses double-spend of a nonce", () => {
    const address = "0x2222222222222222222222222222222222222222";
    const record = mintNonce({
      walletAddress: address,
      family: "evm",
      ttlSeconds: 300,
    });

    const firstAttempt = verifyAndConsumeNonce({
      nonce: record.nonce,
      walletAddress: address,
      family: "evm",
    });
    expect(firstAttempt.ok).toBe(true);

    const secondAttempt = verifyAndConsumeNonce({
      nonce: record.nonce,
      walletAddress: address,
      family: "evm",
    });
    expect(secondAttempt.ok).toBe(false);
    expect(secondAttempt.status).toBe("already_used");
  });

  it("refuses consumption when wallet address does not match", () => {
    const record = mintNonce({
      walletAddress: "0x3333333333333333333333333333333333333333",
      family: "evm",
      ttlSeconds: 300,
    });

    const result = verifyAndConsumeNonce({
      nonce: record.nonce,
      walletAddress: "0x4444444444444444444444444444444444444444",
      family: "evm",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("address_mismatch");
  });

  it("refuses consumption when chain family does not match", () => {
    const record = mintNonce({
      walletAddress: "0x5555555555555555555555555555555555555555",
      family: "evm",
      ttlSeconds: 300,
    });

    const result = verifyAndConsumeNonce({
      nonce: record.nonce,
      walletAddress: "0x5555555555555555555555555555555555555555",
      family: "stellar",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("family_mismatch");
  });

  it("refuses expired nonce", () => {
    const address = "0x6666666666666666666666666666666666666666";
    const record = mintNonce({
      walletAddress: address,
      family: "evm",
      ttlSeconds: 10,
    });

    const result = verifyAndConsumeNonce({
      nonce: record.nonce,
      walletAddress: address,
      family: "evm",
      now: record.expiresAt + 1000,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("expired");
  });

  it("prunes expired nonces correctly", () => {
    const record = mintNonce({
      walletAddress: "0x7777777777777777777777777777777777777777",
      family: "evm",
      ttlSeconds: 5,
    });

    expect(peekNonce(record.nonce)).toBeDefined();

    const pruned = pruneExpiredNonces(record.expiresAt + 70000);
    expect(pruned).toBeGreaterThanOrEqual(1);
    expect(peekNonce(record.nonce)).toBeUndefined();
  });
});
