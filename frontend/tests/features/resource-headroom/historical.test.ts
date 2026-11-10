import { describe, expect, it } from "vitest";
import { compareResourceHeadroom, type RawInvocationSample } from "@/server/research/resource-headroom";
import { depsFromSample, TX_HASH } from "./fixtures";
import lightInvocation from "./data/light-invocation.json";

describe("historical mode", () => {
  it("reads historical transaction resource usage by txHash", async () => {
    const report = await compareResourceHeadroom(
      {
        mode: "historical",
        txHash: TX_HASH,
        warningThresholdPct: 80,
        network: "stellar-testnet",
      },
      depsFromSample(lightInvocation as unknown as RawInvocationSample),
    );
    expect(report.state).toBe("complete");
    expect(report.resources).toHaveLength(7);
  });
});
