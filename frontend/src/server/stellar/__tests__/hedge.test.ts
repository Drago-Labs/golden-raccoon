import { describe, expect, it } from "vitest";
import { hedgedExecute } from "../transport/hedge";
import { RequestBudget } from "../transport/budget";

describe("Hedged Reads with Loser Cancellation", () => {
  it("completes primary request fast without dispatching hedged request", async () => {
    let hedgedCalled = false;

    const result = await hedgedExecute(
      "https://primary.test",
      "https://secondary.test",
      async (url) => {
        if (url === "https://secondary.test") {
          hedgedCalled = true;
          return "secondary-val";
        }
        await new Promise((r) => setTimeout(r, 10));
        return "primary-val";
      },
      {
        hedgeDelayMs: 100,
      },
    );

    expect(result.value).toBe("primary-val");
    expect(result.winnerUrl).toBe("https://primary.test");
    expect(result.hedgedDispatched).toBe(false);
    expect(hedgedCalled).toBe(false);
  });

  it("dispatches hedged request when primary is slow and cancels the loser", async () => {
    let primaryCancelled = false;
    let secondaryCancelled = false;

    const result = await hedgedExecute(
      "https://primary.test",
      "https://secondary.test",
      async (url, signal) => {
        if (url === "https://primary.test") {
          return new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => resolve("primary-slow"), 300);
            signal.addEventListener("abort", () => {
              clearTimeout(timer);
              primaryCancelled = true;
              reject(new Error("aborted"));
            });
          });
        }
        if (url === "https://secondary.test") {
          return new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => resolve("secondary-fast"), 20);
            signal.addEventListener("abort", () => {
              clearTimeout(timer);
              secondaryCancelled = true;
              reject(new Error("aborted"));
            });
          });
        }
        throw new Error("unexpected URL");
      },
      {
        hedgeDelayMs: 30,
      },
    );

    expect(result.value).toBe("secondary-fast");
    expect(result.winnerUrl).toBe("https://secondary.test");
    expect(result.hedgedDispatched).toBe(true);

    await new Promise((r) => setTimeout(r, 40));
    expect(primaryCancelled).toBe(true);
    expect(secondaryCancelled).toBe(false);
  });

  it("enforces request budget across hedged execution", async () => {
    const budget = new RequestBudget({
      totalBudgetMs: 50,
      startedAt: Date.now(),
    });

    await expect(
      hedgedExecute(
        "https://primary.test",
        "https://secondary.test",
        async () => {
          await new Promise((r) => setTimeout(r, 200));
          return "too-late";
        },
        {
          budget,
          hedgeDelayMs: 10,
        },
      ),
    ).rejects.toThrow();
  });
});
