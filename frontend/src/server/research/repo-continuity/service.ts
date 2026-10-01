export class RepoContinuityError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RepoContinuityError";
    this.code = code;
  }
}

export interface RepoRecord {
  name: string;
  state: "ok" | "rate_limited" | "not_found" | "private" | "archived" | "transferred" | "renamed" | "fork_only";
  transferredTo?: string;
  observedAt?: string;
  commits?: { window: string; count: number }[];
  releases?: { tag: string; publishedAt: string }[];
  maintainers?: { login: string; endedAt?: string }[];
}

export interface RepoInput {
  repos: RepoRecord[];
  token?: string;
}

export function assertRepoName(value: string): void {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new RepoContinuityError("invalid_repo", "Repository must look like owner/name.");
  }
}

function metrics(repo: RepoRecord) {
  const active = (repo.maintainers ?? []).filter((maintainer) => !maintainer.endedAt);
  const turnover = (repo.maintainers ?? []).filter((maintainer) => maintainer.endedAt).length;
  return {
    commits: repo.commits ?? [],
    releaseCount: (repo.releases ?? []).length,
    releases: repo.releases ?? [],
    activeMaintainerCount: active.length,
    turnover,
  };
}

export function measureRepositories(input: RepoInput) {
  const byName = new Map(input.repos.map((repo) => [repo.name, repo]));
  const followed = new Set<string>();
  const rows = [];

  for (const repo of input.repos) {
    if (followed.has(repo.name)) continue;
    if (repo.state === "rate_limited") {
      rows.push({ name: repo.name, status: "unavailable", activity: null, label: "rate_limited" });
      continue;
    }
    if (repo.state === "not_found" || repo.state === "private") {
      rows.push({ name: repo.name, status: repo.state, activity: null, label: repo.state });
      continue;
    }
    if (repo.state === "transferred" && repo.transferredTo) {
      followed.add(repo.transferredTo);
      const next = byName.get(repo.transferredTo);
      rows.push({
        name: repo.name,
        status: "transferred",
        label: "transferred",
        followedTo: repo.transferredTo,
        observedAt: repo.observedAt ?? null,
        activity: next && next.state !== "rate_limited" && next.state !== "not_found" && next.state !== "private" ? metrics(next) : null,
      });
      continue;
    }
    rows.push({
      name: repo.name,
      status: repo.state,
      label: repo.state,
      observedAt: repo.observedAt ?? null,
      activity: metrics(repo),
    });
  }

  return {
    rows,
    coverage: "Public GitHub metadata only. Rate limits, missing repos, and private repos are not zero activity.",
  };
}
