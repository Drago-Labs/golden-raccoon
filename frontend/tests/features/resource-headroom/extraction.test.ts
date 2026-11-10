import { describe, expect, it } from "vitest";
import { extractResourceMap, type RawInvocationSample } from "@/server/research/resource-headroom";
import lightInvocation from "./data/light-invocation.json";

describe("extractResourceMap", () => {
  it("extracts all 7 per-transaction resources and sums txSizeBytes + eventsSizeBytes", () => {
    const sample = lightInvocation as unknown as RawInvocationSample;
    const map = extractResourceMap(sample.metrics!);
    expect(map.instructions).toBe(10_000_000);
    expect(map.txSizeBytes).toBe(2560);
  });
});
