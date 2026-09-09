import { describe, expect, it } from "vitest";
import { RequestBudget, withBudgetTimeout } from "../transport/budget";
import { StellarDataLayerError } from "../errors";

describe("Request Budget & Bounded Failover", () => {
  it("tracks elapsed time and remaining budget correctly", () => {
    let now = 1000;
    const budget = new RequestBudget({
      totalBudgetMs: 5000,
      startedAt: now,
      now: () => now,
    });

    expect(budget.elapsedMs(now)).toBe(0);
    expect(budget.remainingMs(now)).toBe(5000);
    expect(budget.isExhausted(now)).toBe(false);

    now = 3000;
    expect(budget.elapsedMs(now)).toBe(2000);
    expect(budget.remainingMs(now)).toBe(3000);

    now = 6000;
    expect(budget.remainingMs(now)).toBe(0);
    expect(budget.isExhausted(now)).toBe(true);
  });

  it("dynamically bounds attempt timeout to not exceed remaining budget", () => {
    let now = 1000;
    const budget = new RequestBudget({
      totalBudgetMs: 2000,
      startedAt: now,
      now: () => now,
    });

    expect(budget.allocateAttemptTimeout(5000, now)).toBe(2000);

    now = 2500;
    expect(budget.allocateAttemptTimeout(5000, now)).toBe(500);

    now = 3500;
    expect(budget.allocateAttemptTimeout(5000, now)).toBe(0);
  });

  it("assertNotExhausted throws StellarDataLayerError with code 'timeout'", () => {
    let now = 1000;
    const budget = new RequestBudget({
      totalBudgetMs: 500,
      startedAt: now,
      now: () => now,
    });

    expect(() => budget.assertNotExhausted(now)).not.toThrow();

    now = 1600;
    expect(() => budget.assertNotExhausted(now)).toThrow(StellarDataLayerError);
    try {
      budget.assertNotExhausted(now);
    } catch (err: unknown) {
      if (err instanceof StellarDataLayerError) {
        expect(err.code).toBe("timeout");
        expect(err.retryable).toBe(true);
      } else {
        throw err;
      }
    }
  });

  it("withBudgetTimeout rejects when operation exceeds remaining budget", async () => {
    const budget = new RequestBudget({
      totalBudgetMs: 50,
      startedAt: Date.now(),
    });

    await expect(
      withBudgetTimeout(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return "ok";
        },
        budget,
        1000,
        "test-op",
      ),
    ).rejects.toThrow(StellarDataLayerError);
  });
});
