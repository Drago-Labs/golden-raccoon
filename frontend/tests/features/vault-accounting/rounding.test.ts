import { describe, expect, it } from "vitest";
import { assessRounding } from "@/server/research/vault-accounting/rounding";

describe("assessRounding", () => {
  it("reports an exact round trip with zero loss", () => {
    const sample = assessRounding(1_000n, 1_000n, 1_000n);
    expect(sample).toEqual({
      amount: "1000",
      sharesFromDeposit: "1000",
      assetsRoundTrip: "1000",
      lossRaw: "0",
      direction: "exact",
    });
  });

  it("flags a loss that favors the vault (depositor gets back less)", () => {
    const sample = assessRounding(1_000n, 999n, 998n);
    expect(sample.lossRaw).toBe("2");
    expect(sample.direction).toBe("favors_vault");
  });

  it("flags the reverse case — the depositor comes out ahead — as favors_depositor", () => {
    const sample = assessRounding(1_000n, 1_001n, 1_002n);
    expect(sample.lossRaw).toBe("-2");
    expect(sample.direction).toBe("favors_depositor");
  });

  it("marks the sample unavailable when previewDeposit could not be read", () => {
    const sample = assessRounding(1_000n, null, null);
    expect(sample).toEqual({
      amount: "1000",
      sharesFromDeposit: null,
      assetsRoundTrip: null,
      lossRaw: null,
      direction: "unavailable",
    });
  });

  it("marks the sample unavailable when only the round-trip convertToAssets call failed", () => {
    const sample = assessRounding(1_000n, 1_000n, null);
    expect(sample.direction).toBe("unavailable");
    expect(sample.sharesFromDeposit).toBe("1000");
    expect(sample.assetsRoundTrip).toBeNull();
  });

  it("handles a zero-amount sample as an exact round trip", () => {
    const sample = assessRounding(0n, 0n, 0n);
    expect(sample.direction).toBe("exact");
    expect(sample.lossRaw).toBe("0");
  });
});
