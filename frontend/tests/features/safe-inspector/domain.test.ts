import { describe, expect, it } from "vitest";
import { inspectSafe } from "@/server/research/safe-inspector/service";

const SAFE = "0x2222222222222222222222222222222222222222";
const MODULE = "0x3333333333333333333333333333333333333333";
const SINGLETON = "0x0000000000000000000000000000000000000001";

describe("safe inspector", () => {
  it("detects a supported version and lists modules as threshold bypasses", () => {
    const report = inspectSafe({
      address: SAFE,
      singleton: SINGLETON,
      owners: ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
      threshold: 2,
      nonce: 4,
      modulePages: [[MODULE], [MODULE]],
      guard: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      fallbackHandler: "0xcccccccccccccccccccccccccccccccccccccccc",
    });
    expect(report.version).toBe("1.3.0");
    expect(report.modules).toEqual([
      { address: MODULE, review: "unreviewed", thresholdBypass: true },
      { address: MODULE, review: "unreviewed", thresholdBypass: true },
    ]);
    expect(report.guard.review).toBe("unreviewed");
    expect(report.control).toMatch(/without meeting the owner threshold/);
  });

  it("reports a non-safe address as unsupported", () => {
    const report = inspectSafe({ address: SAFE });
    expect(report.supported).toBe(false);
    expect(report.control).toMatch(/not reported as safe/);
  });

  it("orders and deduplicates events across pages", () => {
    const event = {
      type: "AddedOwner" as const,
      block: 2,
      logIndex: 1,
      tx: "0xabc",
      page: 1,
    };
    const report = inspectSafe({
      address: SAFE,
      singleton: "0x0000000000000000000000000000000000000002",
      events: [
        { type: "ChangedThreshold", block: 3, logIndex: 0, tx: "0xdef", page: 2 },
        event,
        { ...event, page: 0 },
        { type: "EnabledModule", block: 2, logIndex: 0, tx: "0xaaa", page: 0 },
      ],
    });
    expect(report.events.map((item) => item.tx)).toEqual(["0xaaa", "0xabc", "0xdef"]);
    expect(report.version).toBe("1.4.1");
  });
});
