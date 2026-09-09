import { describe, expect, it } from "vitest";
import {
  IdempotencyStore,
  IdempotencyPayloadMismatchError,
  normalizeIdempotencyKey,
  isValidIdempotencyKey,
  assertValidIdempotencyKey,
  computePayloadFingerprint,
} from "../idempotency";

describe("idempotency key validation", () => {
  it("normalizes and trims idempotency keys", () => {
    expect(normalizeIdempotencyKey("  test-key-123  ")).toBe("test-key-123");
  });

  it("validates permissible key characters", () => {
    expect(isValidIdempotencyKey("valid-key_123.ABC:xyz")).toBe(true);
    expect(isValidIdempotencyKey("")).toBe(false);
    expect(isValidIdempotencyKey("invalid spaces in key")).toBe(false);
    expect(isValidIdempotencyKey("invalid@char#")).toBe(false);
  });

  it("assertValidIdempotencyKey throws on invalid key", () => {
    expect(() => assertValidIdempotencyKey("bad key!!")).toThrow();
    expect(assertValidIdempotencyKey("good-key-1")).toBe("good-key-1");
  });
});

describe("payload fingerprinting", () => {
  it("produces deterministic SHA-256 fingerprint regardless of key order", () => {
    const objA = { amount: "100", asset: "USDC", wallet: "0x123" };
    const objB = { wallet: "0x123", amount: "100", asset: "USDC" };
    expect(computePayloadFingerprint(objA)).toBe(computePayloadFingerprint(objB));
  });

  it("ignores volatile fields during fingerprint computation", () => {
    const payload1 = {
      amount: "100",
      asset: "USDC",
      timestamp: 1000,
      fetchedAt: "2026-01-01T00:00:00Z",
    };
    const payload2 = {
      amount: "100",
      asset: "USDC",
      timestamp: 9999,
      fetchedAt: "2026-01-02T12:00:00Z",
    };
    expect(computePayloadFingerprint(payload1)).toBe(computePayloadFingerprint(payload2));
  });

  it("detects differences in critical business payload fields", () => {
    const base = { amount: "100", asset: "USDC", toAsset: "XLM" };
    const modified = { amount: "101", asset: "USDC", toAsset: "XLM" };
    expect(computePayloadFingerprint(base)).not.toBe(computePayloadFingerprint(modified));
  });
});

describe("IdempotencyStore concurrency and replay lifecycle", () => {
  it("initial request acquires gate as fresh execution", async () => {
    const store = new IdempotencyStore();
    const gate = await store.acquireOrWait("key-1", "0xwallet", "fp-1");
    expect(gate.isReplay).toBe(false);
    expect(gate.outcome).toBeUndefined();
  });

  it("returns stored outcome on identical replay with replayed flag", async () => {
    const store = new IdempotencyStore();
    const gate1 = await store.acquireOrWait("key-2", "0xwallet", "fp-2");
    expect(gate1.isReplay).toBe(false);

    store.resolveKey("key-2", { hash: "0xhash123", status: "confirmed" });

    const gate2 = await store.acquireOrWait<{ hash: string; status: string }>("key-2", "0xwallet", "fp-2");
    expect(gate2.isReplay).toBe(true);
    expect(gate2.outcome).toMatchObject({ hash: "0xhash123", status: "confirmed" });
  });

  it("rejects replay with mutated payload fingerprint with 409 Conflict", async () => {
    const store = new IdempotencyStore();
    await store.acquireOrWait("key-3", "0xwallet", "fp-original");
    store.resolveKey("key-3", { hash: "0xhash1" });

    await expect(
      store.acquireOrWait("key-3", "0xwallet", "fp-mutated")
    ).rejects.toThrow(IdempotencyPayloadMismatchError);

    try {
      await store.acquireOrWait("key-3", "0xwallet", "fp-mutated");
    } catch (err: unknown) {
      const mismatchErr = err as IdempotencyPayloadMismatchError;
      expect(mismatchErr.statusCode).toBe(409);
      expect(mismatchErr.code).toBe("idempotency_payload_mismatch");
    }
  });

  it("coalesces concurrent requests: loser awaits winner without secondary execution", async () => {
    const store = new IdempotencyStore();
    let winnerExecutions = 0;

    const req1Promise = (async () => {
      const gate = await store.acquireOrWait("concurrent-key", "0xwallet", "fp-same");
      if (!gate.isReplay) {
        winnerExecutions += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
        const result = { hash: "0xfirst_broadcast", replayed: false };
        store.resolveKey("concurrent-key", result);
        return result;
      }
      return { ...(gate.outcome as Record<string, unknown>), replayed: true };
    })();

    const req2Promise = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const gate = await store.acquireOrWait<{ hash: string }>("concurrent-key", "0xwallet", "fp-same");
      if (!gate.isReplay) {
        winnerExecutions += 1;
        store.resolveKey("concurrent-key", { hash: "0xsecond_broadcast" });
        return { hash: "0xsecond_broadcast", replayed: false };
      }
      return { ...(gate.outcome as Record<string, unknown>), replayed: true };
    })();

    const [res1, res2] = await Promise.all([req1Promise, req2Promise]);

    expect(winnerExecutions).toBe(1);
    expect(res1.hash).toBe("0xfirst_broadcast");
    expect(res2.hash).toBe("0xfirst_broadcast");
    expect(res2.replayed).toBe(true);
  });

  it("propagates error to concurrent waiters if in-flight execution fails", async () => {
    const store = new IdempotencyStore();

    const p1 = store.acquireOrWait("fail-key", "0xwallet", "fp");
    const p2 = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return store.acquireOrWait("fail-key", "0xwallet", "fp");
    })();

    await p1;
    store.rejectKey("fail-key", new Error("Broadcast dropped"));

    await expect(p2).rejects.toThrow("Broadcast dropped");
  });

  it("expires entries after the configured retention window (24h default)", () => {
    let mockNow = 1000;
    const store = new IdempotencyStore({
      retentionWindowMs: 60_000,
      now: () => mockNow,
    });

    store.resolveKey("exp-key", { hash: "0xexp" }, "fp-exp", "0xwallet");
    expect(store.get("exp-key")).toBeDefined();

    mockNow = 1000 + 60_001;
    expect(store.get("exp-key")).toBeUndefined();
  });
});
