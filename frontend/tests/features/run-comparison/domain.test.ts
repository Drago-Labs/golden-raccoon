import { describe, expect, it } from "vitest";
import { compareRuns } from "@/server/research/run-comparison/service";
import {
  ALL_RUNS,
  OTHER_WALLET,
  RUN_AGENT_SET_CHANGED,
  RUN_AMBIGUOUS_FINDINGS,
  RUN_CHANGED_INPUTS,
  RUN_EARLIER,
  RUN_NO_RESULTS,
  RUN_OTHER_MODE,
  RUN_OTHER_NETWORK,
  RUN_OTHER_SUBJECT,
  RUN_OTHER_WALLET,
  RUN_PROVIDER_OUTAGE,
  RUN_SINGLE_FINDING,
  createRunReader,
  request,
} from "./fixtures";

describe("alignment by identity, not position", () => {
  it("aligns reordered results without calling every agent changed", async () => {
    const report = await compareRuns(request(RUN_EARLIER.id, "run-later"), createRunReader());

    expect(report.agentDifferences.map((entry) => entry.agent)).toEqual(["news", "onchain", "portfolio"]);

    for (const difference of report.agentDifferences) {
      expect(difference.alignment).toBe("present_in_both");
      expect(difference.scoreChange.delta).toBe(0);
    }
  });

  it("marks an agent that ran only once, rather than scoring it zero", async () => {
    const report = await compareRuns(request(RUN_EARLIER.id, RUN_AGENT_SET_CHANGED.id), createRunReader());

    const news = report.agentDifferences.find((entry) => entry.agent === "news");
    const social = report.agentDifferences.find((entry) => entry.agent === "social");

    expect(news?.alignment).toBe("only_in_left");
    expect(news?.scoreChange.after).toBeNull();
    expect(social?.alignment).toBe("only_in_right");
    expect(social?.scoreChange.before).toBeNull();
  });

  it("reports a real score change with both values", async () => {
    const report = await compareRuns(request(RUN_EARLIER.id, RUN_PROVIDER_OUTAGE.id), createRunReader());
    const onchain = report.agentDifferences.find((entry) => entry.agent === "onchain");

    expect(onchain?.scoreChange).toEqual({ before: 50, after: 75, delta: 25 });
  });
});

describe("findings", () => {
  it("pairs a finding present in both runs", async () => {
    const report = await compareRuns(request(RUN_EARLIER.id, "run-later"), createRunReader());
    const onchain = report.agentDifferences.find((entry) => entry.agent === "onchain");

    expect(onchain?.findings).toHaveLength(1);
    expect(onchain?.findings[0].alignment).toBe("matched");
  });

  it("marks a finding added in the second run", async () => {
    const report = await compareRuns(request(RUN_AGENT_SET_CHANGED.id, RUN_EARLIER.id), createRunReader());
    const portfolio = report.agentDifferences.find((entry) => entry.agent === "portfolio");

    expect(portfolio?.findings[0].alignment).toBe("added");
  });

  it("refuses to guess when one label appears twice", async () => {
    const report = await compareRuns(request(RUN_SINGLE_FINDING.id, RUN_AMBIGUOUS_FINDINGS.id), createRunReader());
    const onchain = report.agentDifferences.find((entry) => entry.agent === "onchain");
    const pair = onchain?.findings[0];

    expect(pair?.alignment).toBe("ambiguous");
    expect(pair?.ambiguityNote).toMatch(/not determined/i);
    expect(pair?.ambiguityNote).toMatch(/No change is claimed/i);
  });

  it("counts ambiguous pairings in the coverage", async () => {
    const report = await compareRuns(request(RUN_SINGLE_FINDING.id, RUN_AMBIGUOUS_FINDINGS.id), createRunReader());

    expect(report.coverage.ambiguousFindingCount).toBe(1);
    expect(report.coverage.state).toBe("partial");
  });
});

describe("outage versus score change", () => {
  it("reports a coverage drop as its own fact with timestamps", async () => {
    const report = await compareRuns(request(RUN_EARLIER.id, RUN_PROVIDER_OUTAGE.id), createRunReader());
    const quality = report.qualityChanges.find((entry) => entry.agent === "onchain");

    expect(quality?.coverageDropped).toBe(true);
    expect(quality?.left?.lastCheckedAt).toBe("2026-02-01T00:00:00.000Z");
    expect(quality?.right?.lastCheckedAt).toBe("2026-02-14T00:00:00.000Z");
    expect(quality?.right?.unavailableSources).toBe(2);
  });

  it("never claims the outage caused the score change", async () => {
    const report = await compareRuns(request(RUN_EARLIER.id, RUN_PROVIDER_OUTAGE.id), createRunReader());
    const quality = report.qualityChanges.find((entry) => entry.agent === "onchain");
    const onchain = report.agentDifferences.find((entry) => entry.agent === "onchain");

    expect(quality?.note).toMatch(/is not recorded and is not claimed here/i);
    expect(onchain?.coOccurringCoverageDrop).toBe(true);
    expect(report.causeNotEstablished).toBe(true);
  });

  it("does not flag a co-occurrence when coverage held steady", async () => {
    const report = await compareRuns(request(RUN_EARLIER.id, "run-later"), createRunReader());

    for (const difference of report.agentDifferences) {
      expect(difference.coOccurringCoverageDrop).toBe(false);
    }
    for (const quality of report.qualityChanges) {
      expect(quality.coverageDropped).toBe(false);
    }
  });

  it("surfaces missing data on each side separately", async () => {
    const report = await compareRuns(request(RUN_EARLIER.id, RUN_PROVIDER_OUTAGE.id), createRunReader());
    const onchain = report.agentDifferences.find((entry) => entry.agent === "onchain");

    expect(onchain?.missingDataChange.before).toEqual([]);
    expect(onchain?.missingDataChange.after).toEqual(["holderDistribution"]);
  });
});

describe("inputs and recommendations", () => {
  it("reports input changes as dotted paths", async () => {
    const report = await compareRuns(request(RUN_EARLIER.id, RUN_CHANGED_INPUTS.id), createRunReader());
    const paths = report.inputDifferences.map((entry) => entry.path);

    expect(paths).toContain("balanceUsd");
    expect(report.inputDifferences.find((entry) => entry.path === "balanceUsd")).toMatchObject({
      before: "1000",
      after: "2500",
      kind: "changed",
    });
    expect(report.inputDifferences.find((entry) => entry.path === "newField")?.kind).toBe("added");
    expect(report.inputDifferences.find((entry) => entry.path === "holdings[1]")?.kind).toBe("added");
  });

  it("separates a changed recommendation from changed observations", async () => {
    const report = await compareRuns(request(RUN_EARLIER.id, "run-later"), createRunReader());

    expect(report.recommendationChange).toMatchObject({ before: "hold", after: "reduce_exposure", changed: true });
    expect(report.decisionScoreChange).toEqual({ before: 40, after: 55, delta: 15 });

    // Every agent observation is unchanged even though the recommendation moved.
    for (const difference of report.agentDifferences) {
      expect(difference.scoreChange.delta).toBe(0);
    }
  });
});

describe("comparability", () => {
  it("labels a pair about two different assets", async () => {
    const report = await compareRuns(request(RUN_EARLIER.id, RUN_OTHER_SUBJECT.id), createRunReader());

    expect(report.comparability).toBe("different_subject");
    expect(report.comparabilityNote).toMatch(/not changes over time/i);
    expect(report.coverage.state).toBe("unavailable");
  });

  it("labels a pair made in different modes", async () => {
    const report = await compareRuns(request(RUN_EARLIER.id, RUN_OTHER_MODE.id), createRunReader());

    expect(report.comparability).toBe("different_mode");
  });

  it("refuses a pair spanning two networks", async () => {
    await expect(compareRuns(request(RUN_EARLIER.id, RUN_OTHER_NETWORK.id), createRunReader())).rejects.toMatchObject({
      code: "cross_context",
      status: 409,
    });
  });

  it("refuses a pair outside the requested network", async () => {
    await expect(
      compareRuns(request(RUN_EARLIER.id, "run-later", { network: "base" }), createRunReader()),
    ).rejects.toMatchObject({ code: "cross_context" });
  });

  it("returns a successful empty result when neither run stored a result", async () => {
    const runs = [RUN_NO_RESULTS, { ...RUN_NO_RESULTS, id: "run-no-results-2", createdAt: "2026-02-25T00:00:00.000Z" }];
    const report = await compareRuns(request("run-no-results", "run-no-results-2"), createRunReader(runs));

    expect(report.coverage.state).toBe("empty");
    expect(report.agentDifferences).toHaveLength(0);
  });
});

describe("ownership", () => {
  it("answers not_found for another wallet's run", async () => {
    await expect(compareRuns(request(RUN_EARLIER.id, RUN_OTHER_WALLET.id), createRunReader())).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
  });

  it("answers the same way for a run that does not exist", async () => {
    const real = await compareRuns(request(RUN_EARLIER.id, RUN_OTHER_WALLET.id), createRunReader()).catch((error) => error);
    const invented = await compareRuns(request(RUN_EARLIER.id, "run-invented"), createRunReader()).catch((error) => error);

    expect(real.code).toBe(invented.code);
    expect(real.message).toBe(invented.message);
  });

  it("re-checks the wallet on the record, so a leaky reader cannot expose a run", async () => {
    const leaky = createRunReader(ALL_RUNS, { ignoreWallet: true });

    await expect(compareRuns(request(RUN_EARLIER.id, RUN_OTHER_WALLET.id), leaky)).rejects.toMatchObject({ code: "not_found" });
  });

  it("exposes no run content when ownership fails", async () => {
    const error = await compareRuns(request(RUN_EARLIER.id, RUN_OTHER_WALLET.id), createRunReader()).catch((caught) => caught);

    expect(JSON.stringify(error.details ?? {})).not.toContain(OTHER_WALLET);
    expect(JSON.stringify(error.details ?? {})).not.toContain("riskScore");
  });

  it("refuses to compare a run against itself", async () => {
    await expect(compareRuns(request(RUN_EARLIER.id, RUN_EARLIER.id), createRunReader())).rejects.toMatchObject({
      code: "same_run",
    });
  });

  it("rejects a request with no wallet", async () => {
    await expect(compareRuns({ leftRunId: "a", rightRunId: "b" }, createRunReader())).rejects.toMatchObject({
      code: "invalid_request",
    });
  });
});

describe("read-only guarantee", () => {
  it("reads exactly two runs and nothing else", async () => {
    const reader = createRunReader();
    await compareRuns(request(RUN_EARLIER.id, "run-later"), reader);

    expect(reader.readCount()).toBe(2);
    expect(reader.log()).toEqual([RUN_EARLIER.id, "run-later"]);
  });

  it("declares that it ran nothing and wrote nothing", async () => {
    const report = await compareRuns(request(RUN_EARLIER.id, "run-later"), createRunReader());

    expect(report.readOnly).toBe(true);
    expect(report.causeNotEstablished).toBe(true);
  });

  it("leaves the stored records untouched", async () => {
    const before = JSON.stringify(ALL_RUNS);
    await compareRuns(request(RUN_EARLIER.id, RUN_PROVIDER_OUTAGE.id), createRunReader());

    expect(JSON.stringify(ALL_RUNS)).toBe(before);
  });
});
