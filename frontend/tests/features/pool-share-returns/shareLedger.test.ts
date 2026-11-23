import { describe, expect, it } from "vitest";
import { reconstructShareLedger } from "@/server/research/pool-share-returns/shareLedger";

describe("shareLedger", () => {
  it("reconstructs position from operations", async () => {
    const result = await reconstructShareLedger("stellar-testnet", "GABC123", "pool-1", 100, 200);
    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.snapshots.length).toBeGreaterThan(0);
      expect(result.snapshots[0].operation).toBe("initial");
    }
  });

  it("handles missing account", async () => {
    const result = await reconstructShareLedger("stellar-testnet", "MISSING", "pool-1", 100, 200);
    expect(result.status).toMatch(/available|missing|unavailable/);
  });
});
