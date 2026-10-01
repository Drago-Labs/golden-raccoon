import { describe, expect, it } from "vitest";
import { measureRepositories } from "@/server/research/repo-continuity/service";

describe("repository continuity", () => {
  it("does not treat a rate limit as zero activity", () => {
    const report = measureRepositories({
      token: "ghp_secret",
      repos: [{ name: "acme/app", state: "rate_limited" }],
    });
    expect(report.rows[0]).toMatchObject({ status: "unavailable", activity: null });
    expect(JSON.stringify(report)).not.toContain("ghp_secret");
  });

  it("follows a transfer once and keeps fixture metrics", () => {
    const report = measureRepositories({
      repos: [
        { name: "acme/old", state: "transferred", transferredTo: "acme/new", observedAt: "2024-01-01" },
        {
          name: "acme/new",
          state: "ok",
          commits: [{ window: "90d", count: 4 }],
          releases: [{ tag: "v2", publishedAt: "2024-02-01" }],
          maintainers: [{ login: "ada" }, { login: "gus", endedAt: "2024-01-01" }],
        },
      ],
    });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      status: "transferred",
      followedTo: "acme/new",
      activity: { releaseCount: 1, activeMaintainerCount: 1, turnover: 1, commits: [{ window: "90d", count: 4 }] },
    });
  });
});
