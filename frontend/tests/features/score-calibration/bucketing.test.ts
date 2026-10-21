import { describe, expect, it } from "vitest";
import { bucketForScore, groupByBucket, SCORE_BUCKETS } from "@/server/research/score-calibration/bucketing";

describe("bucketForScore", () => {
  it("assigns the lowest bucket for score 0", () => {
    expect(bucketForScore(0)?.label).toBe("0-20");
  });

  it("assigns the boundary score to the upper bucket", () => {
    expect(bucketForScore(20)?.label).toBe("20-40");
  });

  it("assigns the top score to the top bucket inclusively", () => {
    expect(bucketForScore(100)?.label).toBe("80-100");
  });
});

describe("groupByBucket", () => {
  it("counts sample size and outcome count per bucket", () => {
    const groups = groupByBucket([
      { score: 10, occurred: true },
      { score: 15, occurred: false },
      { score: 90, occurred: true },
    ]);

    expect(groups.get("0-20")).toMatchObject({ sampleSize: 2, outcomeCount: 1 });
    expect(groups.get("80-100")).toMatchObject({ sampleSize: 1, outcomeCount: 1 });
    expect(groups.size).toBe(SCORE_BUCKETS.length);
  });

  it("reports zero sample size for a bucket with no included snapshots", () => {
    const groups = groupByBucket([]);
    for (const bucket of SCORE_BUCKETS) {
      expect(groups.get(bucket.label)).toMatchObject({ sampleSize: 0, outcomeCount: 0 });
    }
  });
});
