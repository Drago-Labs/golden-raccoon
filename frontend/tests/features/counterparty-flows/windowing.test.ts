import { describe, expect, it } from "vitest";
import { CounterpartyFlowsError } from "@/server/research/counterparty-flows/errors";
import { resolveWindow, withinWindow } from "@/server/research/counterparty-flows/windowing";

describe("windowing", () => {
  it("resolves a 30d preset from now", () => {
    const now = Date.parse("2026-02-01T00:00:00.000Z");
    const window = resolveWindow("30d", undefined, undefined, now);
    expect(window.days).toBe(30);
    expect(window.end).toBe("2026-02-01T00:00:00.000Z");
    expect(window.start).toBe("2026-01-02T00:00:00.000Z");
  });

  it("accepts a custom ISO window and rejects inverted bounds", () => {
    const window = resolveWindow("7d", "2026-01-01T00:00:00.000Z", "2026-01-08T00:00:00.000Z");
    expect(window.days).toBe(7);
    expect(withinWindow("2026-01-04T12:00:00.000Z", window)).toBe(true);
    expect(withinWindow("2025-12-31T23:59:59.000Z", window)).toBe(false);

    expect(() => resolveWindow("7d", "2026-01-10T00:00:00.000Z", "2026-01-01T00:00:00.000Z")).toThrow(
      CounterpartyFlowsError,
    );
  });
});
