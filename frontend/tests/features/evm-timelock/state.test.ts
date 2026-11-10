import { describe, expect, it } from "vitest";
import { computeOperationStatus } from "@/server/research/evm-timelock";

describe("computeOperationStatus", () => {
  it("distinguishes pending, ready, done, and cancelled states", () => {
    expect(
      computeOperationStatus({ scheduledAtTimestamp: 1000, delaySeconds: 100, recordedTimestamp: 1050, executed: false, cancelled: false }),
    ).toBe("pending");
    expect(
      computeOperationStatus({ scheduledAtTimestamp: 1000, delaySeconds: 100, recordedTimestamp: 1100, executed: false, cancelled: false }),
    ).toBe("ready");
    expect(
      computeOperationStatus({ scheduledAtTimestamp: 1000, delaySeconds: 100, recordedTimestamp: 1100, executed: true, cancelled: false }),
    ).toBe("done");
    expect(
      computeOperationStatus({ scheduledAtTimestamp: 1000, delaySeconds: 100, recordedTimestamp: 1100, executed: false, cancelled: true }),
    ).toBe("cancelled");
  });
});
