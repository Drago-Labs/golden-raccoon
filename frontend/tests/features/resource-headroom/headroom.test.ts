import { describe, expect, it } from "vitest";
import {
  computeResourceHeadroom,
  DEFAULT_NETWORK_LIMITS,
  type RawInvocationSample,
} from "@/server/research/resource-headroom";
import nearLimitInvocation from "./data/near-limit-invocation.json";

describe("computeResourceHeadroom", () => {
  it("computes exact fractions and flags resources at or above warningThresholdPct", () => {
    const sample = nearLimitInvocation as unknown as RawInvocationSample;
    const items = computeResourceHeadroom(
      sample.metrics!,
      DEFAULT_NETWORK_LIMITS["stellar-testnet"],
      80,
    );
    const cpu = items.find((i) => i.key === "instructions")!;
    expect(cpu.fractionDisplay).toBe("92000000 / 100000000");
    expect(cpu.utilizationPct).toBe(92);
    expect(cpu.headroomPct).toBe(8);
    expect(cpu.flagged).toBe(true);
  });
});
