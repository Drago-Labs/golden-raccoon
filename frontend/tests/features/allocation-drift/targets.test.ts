import { describe, expect, it } from "vitest";
import { AllocationDriftError } from "@/server/research/allocation-drift/errors";
import { allocationRequestSchema, snapshotSchema, targetSchema } from "@/server/research/allocation-drift/schema";
import { defineTargets, percentToBasisPoints } from "@/server/research/allocation-drift/targetDefinition";
import { loadTargets, preferenceKey, saveTargets, walletScope } from "@/server/research/allocation-drift/targetStorage";
import { validateTargets } from "@/server/research/allocation-drift/targetValidation";
import {
  allocationRequest,
  balancedTarget,
  currentSnapshot,
  DAI,
  earlierSnapshot,
  foreignWallet,
  invalidTarget,
  memoryStorage,
  network,
  USDC,
  wallet,
  WETH,
} from "./fixtures";

describe("targetDefinition", () => {
  it("converts whole and fractional percentages to basis points", () => {
    expect(percentToBasisPoints("100")).toBe(10_000);
    expect(percentToBasisPoints("12.34")).toBe(1234);
    expect(percentToBasisPoints("0.05")).toBe(5);
    expect(percentToBasisPoints("5")).toBe(500);
  });

  it("rejects more than two decimal places", () => {
    expect(() => percentToBasisPoints("12.345")).toThrowError(/two decimal places/);
  });

  it("rejects a percentage above one hundred", () => {
    expect(() => percentToBasisPoints("100.01")).toThrowError(/cannot exceed 100%/);
  });

  it("builds an asset target whose members are the asset itself", () => {
    const target = defineTargets("asset", [
      { key: ` ${WETH} `, label: " WETH ", percent: "60", members: [] },
      { key: USDC, label: "USDC", percent: "40", members: [] },
    ]);
    expect(target).toEqual({
      version: 1,
      mode: "asset",
      entries: [
        { key: WETH, label: "WETH", basisPoints: 6000, members: [WETH] },
        { key: USDC, label: "USDC", basisPoints: 4000, members: [USDC] },
      ],
    });
  });

  it("keeps the declared members of a group target", () => {
    const target = defineTargets("group", [
      { key: "group:stables", label: "Stables", percent: "40", members: [USDC, DAI] },
      { key: "group:volatile", label: "Volatile", percent: "60", members: [WETH] },
    ]);
    expect(target.entries[0].members).toEqual([USDC, DAI]);
    expect(validateTargets(target).mode).toBe("group");
  });
});

describe("targetValidation", () => {
  it("accepts the recorded balanced target", () => {
    expect(validateTargets(balancedTarget()).entries).toHaveLength(3);
  });

  it("rejects a target that does not sum to one hundred percent with a typed error", () => {
    try {
      validateTargets(invalidTarget());
      throw new Error("expected the 90% target to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(AllocationDriftError);
      expect((error as AllocationDriftError).code).toBe("invalid_request");
      expect((error as AllocationDriftError).message).toMatch(/sum to exactly 100%/);
    }
  });

  it("rejects malformed input before any calculation", () => {
    expect(() => validateTargets({ version: 2, mode: "asset", entries: [] })).toThrowError(/malformed/);
  });

  it("rejects duplicate target keys", () => {
    const target = balancedTarget();
    target.entries[1] = { ...target.entries[1], key: target.entries[0].key, members: [target.entries[0].key] };
    expect(() => validateTargets(target)).toThrowError(/unique/);
  });

  it("rejects the reserved unallocated key", () => {
    const target = balancedTarget();
    target.entries[0] = { ...target.entries[0], key: "__unallocated__", members: ["__unallocated__"] };
    expect(() => validateTargets(target)).toThrowError(/unique/);
  });

  it("rejects an asset target that points at another asset", () => {
    const target = balancedTarget();
    target.entries[0] = { ...target.entries[0], members: [USDC] };
    expect(() => validateTargets(target)).toThrowError(/own asset identity/);
  });

  it("rejects an asset that belongs to two groups", () => {
    const target = {
      version: 1 as const,
      mode: "group" as const,
      entries: [
        { key: "group:a", label: "A", basisPoints: 5000, members: [USDC] },
        { key: "group:b", label: "B", basisPoints: 5000, members: [USDC] },
      ],
    };
    expect(() => validateTargets(target)).toThrowError(/more than one target or group/);
  });
});

describe("targetStorage", () => {
  it("scopes preferences per network and canonical wallet case", () => {
    expect(walletScope(wallet.toUpperCase(), network)).toBe(walletScope(wallet, network));
    expect(walletScope(wallet, "base")).not.toBe(walletScope(wallet, network));
    expect(preferenceKey(wallet, network)).toBe(`golden-raccoon:allocation-targets:v1:${walletScope(wallet, network)}`);
  });

  it("round-trips a versioned target and its observations", () => {
    const storage = memoryStorage();
    saveTargets(storage, wallet, network, balancedTarget(), [earlierSnapshot(), currentSnapshot()]);
    const loaded = loadTargets(storage, wallet, network);
    expect(loaded.targets).toEqual(balancedTarget());
    expect(loaded.history.map((row) => row.at)).toEqual(["2026-11-01T00:00:00.000Z", "2026-11-20T00:00:00.000Z"]);
  });

  it("stores observations of other wallets nowhere", () => {
    const storage = memoryStorage();
    const foreign = { ...currentSnapshot(), walletAddress: foreignWallet };
    saveTargets(storage, wallet, network, balancedTarget(), [currentSnapshot(), foreign]);
    expect(loadTargets(storage, wallet, network).history.map((row) => row.walletAddress)).toEqual([wallet]);
  });

  it("keeps one observation per observation time", () => {
    const storage = memoryStorage();
    saveTargets(storage, wallet, network, null, [currentSnapshot(), currentSnapshot(), earlierSnapshot()]);
    expect(loadTargets(storage, wallet, network).history).toHaveLength(2);
  });

  it("refuses to save more than the preference size limit", () => {
    const storage = memoryStorage();
    const wide = {
      ...currentSnapshot(),
      holdings: Array.from({ length: 200 }, (_, index) => ({
        key: `ethereum:0x${index.toString(16).padStart(40, "0")}`,
        label: `Token ${index}`.padEnd(100, "x"),
        valueUsd: "1.00000000",
        priceUsd: "1.00000000",
      })),
    };
    const history = Array.from({ length: 80 }, (_, index) => ({
      ...wide,
      at: new Date(Date.parse("2026-01-01T00:00:00.000Z") + index * 86_400_000).toISOString(),
    }));
    expect(() => saveTargets(storage, wallet, network, balancedTarget(), history)).toThrowError(/preference limit/);
  });

  it("reads nothing from another scope, malformed JSON or an unknown version", () => {
    const stored = memoryStorage();
    saveTargets(stored, wallet, network, balancedTarget(), [currentSnapshot()]);
    expect(loadTargets(stored, wallet, "base")).toEqual({ targets: null, history: [] });
    expect(loadTargets(stored, foreignWallet, network)).toEqual({ targets: null, history: [] });

    const broken = memoryStorage({ [preferenceKey(wallet, network)]: "{not json" });
    expect(loadTargets(broken, wallet, network)).toEqual({ targets: null, history: [] });

    const old = memoryStorage({
      [preferenceKey(wallet, network)]: JSON.stringify({ version: 0, scope: walletScope(wallet, network) }),
    });
    expect(loadTargets(old, wallet, network)).toEqual({ targets: null, history: [] });
  });

  it("drops a stored observation that no longer parses", () => {
    const storage = memoryStorage({
      [preferenceKey(wallet, network)]: JSON.stringify({
        version: 1,
        scope: walletScope(wallet, network),
        targets: balancedTarget(),
        history: [{ walletAddress: wallet, network, at: "not-a-date", source: "x", completeValuation: true, holdings: [] }],
      }),
    });
    const loaded = loadTargets(storage, wallet, network);
    expect(loaded.targets).not.toBeNull();
    expect(loaded.history).toEqual([]);
  });
});

describe("schema", () => {
  it("applies the documented request defaults", () => {
    const parsed = allocationRequestSchema.parse({
      walletAddress: wallet,
      network,
      windowStart: "2026-11-01T00:00:00.000Z",
      windowEnd: "2026-11-21T00:00:00.000Z",
    });
    expect(parsed.thresholdBps).toBe(500);
    expect(parsed.history).toEqual([]);
  });

  it("rejects an empty, reversed or over-long window", () => {
    expect(allocationRequestSchema.safeParse(allocationRequest({ windowEnd: allocationRequest().windowStart })).success).toBe(false);
    expect(allocationRequestSchema.safeParse(allocationRequest({ windowEnd: "2027-06-01T00:00:00.000Z" })).success).toBe(false);
  });

  it("rejects a wallet whose family does not match the network", () => {
    expect(allocationRequestSchema.safeParse(allocationRequest({ network: "stellar-pubnet" })).success).toBe(false);
    expect(
      allocationRequestSchema.safeParse(allocationRequest({ walletAddress: `G${"A".repeat(55)}`, network: "stellar-pubnet" })).success,
    ).toBe(true);
  });

  it("rejects snapshot amounts that are not nonnegative decimal strings", () => {
    const snapshot = currentSnapshot();
    expect(snapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(
      snapshotSchema.safeParse({ ...snapshot, holdings: [{ ...snapshot.holdings[0], valueUsd: "-1" }] }).success,
    ).toBe(false);
  });

  it("keeps the target schema the single declaration of a stored target", () => {
    expect(targetSchema.safeParse(balancedTarget()).success).toBe(true);
    expect(targetSchema.safeParse({ ...balancedTarget(), version: 2 }).success).toBe(false);
  });
});
