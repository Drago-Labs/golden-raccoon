import { describe, expect, it } from "vitest";
import { compareResourceHeadroom, type RawInvocationSample } from "@/server/research/resource-headroom";
import { CONTRACT_ID, depsFromSample } from "./fixtures";
import nearLimitInvocation from "./data/near-limit-invocation.json";
import simulationFailure from "./data/simulation-failure.json";

describe("compareResourceHeadroom service", () => {
  it("flags near-limit resources above threshold", async () => {
    const report = await compareResourceHeadroom(
      {
        mode: "simulation",
        contractId: CONTRACT_ID,
        functionName: "swap",
        args: [],
        warningThresholdPct: 80,
        network: "stellar-testnet",
      },
      depsFromSample(nearLimitInvocation as unknown as RawInvocationSample),
    );
    expect(report.state).toBe("complete");
    expect(report.flaggedResources.length).toBeGreaterThan(0);
  });

  it("shows simulation failures with diagnostic events instead of zero usage", async () => {
    const report = await compareResourceHeadroom(
      {
        mode: "simulation",
        contractId: CONTRACT_ID,
        functionName: "swap",
        args: [],
        warningThresholdPct: 80,
        network: "stellar-testnet",
      },
      depsFromSample(simulationFailure as unknown as RawInvocationSample),
    );
    expect(report.simulationFailed).toBe(true);
    expect(report.resources).toEqual([]);
    expect(report.diagnosticEvents).toContain(
      "diagnostic: CPU instruction budget exceeded inside router loop",
    );
  });
});
