import type { UnifiedRelease } from "@/server/research/package-provenance/releaseHistory";
import type { PackageProvenanceDeps } from "@/server/research/package-provenance/service";

export function stubResponse(status: number, body: unknown, contentType = "application/json"): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": contentType }),
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response;
}

export function npmPackumentFixture(options: { withAttestations?: boolean; maintainersByVersion?: Record<string, string[]>; scriptsByVersion?: Record<string, Record<string, string>> } = {}) {
  const versions = ["1.0.0", "1.1.0", "1.2.0"];
  const maintainers = options.maintainersByVersion ?? {
    "1.0.0": ["alice"],
    "1.1.0": ["alice"],
    "1.2.0": ["alice", "mallory"],
  };
  const scripts = options.scriptsByVersion ?? {};

  return {
    name: "@stellar/example-sdk",
    "dist-tags": { latest: "1.2.0" },
    time: {
      "1.0.0": "2026-01-01T00:00:00.000Z",
      "1.1.0": "2026-02-01T00:00:00.000Z",
      "1.2.0": "2026-03-01T00:00:00.000Z",
    },
    versions: Object.fromEntries(
      versions.map((version) => [
        version,
        {
          name: "@stellar/example-sdk",
          version,
          repository: { type: "git", url: "git+https://github.com/stellar/example-sdk.git" },
          maintainers: (maintainers[version] ?? []).map((name) => ({ name, email: `${name}@example.com` })),
          scripts: scripts[version] ?? {},
          dist: options.withAttestations && version === "1.2.0" ? { attestations: { url: "https://registry.npmjs.org/-/npm/v1/attestations/@stellar%2fexample-sdk@1.2.0" } } : {},
        },
      ]),
    ),
  };
}

export function npmAttestationBundleFixture(repository: string, commit: string, workflowPath = ".github/workflows/publish.yml") {
  const payload = {
    _type: "https://in-toto.io/Statement/v1",
    subject: [{ name: "pkg:npm/%40stellar/example-sdk@1.2.0" }],
    predicateType: "https://slsa.dev/provenance/v1",
    predicate: {
      buildDefinition: {
        externalParameters: { workflow: { ref: "refs/tags/v1.2.0", repository, path: workflowPath } },
        resolvedDependencies: [{ uri: `git+${repository}@refs/tags/v1.2.0`, digest: { gitCommit: commit } }],
      },
      runDetails: { metadata: { invocationId: `${repository}/actions/runs/123456` } },
    },
  };

  return {
    attestations: [
      {
        predicateType: "https://slsa.dev/provenance/v1",
        bundle: {
          dsseEnvelope: {
            payload: Buffer.from(JSON.stringify(payload), "utf-8").toString("base64"),
            payloadType: "application/vnd.in-toto+json",
          },
        },
      },
    ],
  };
}

export function cratesCrateFixture(options: { withTrustpub?: boolean } = {}) {
  return {
    crate: { name: "example-crate", repository: "https://github.com/stellar/example-crate" },
    versions: [
      {
        num: "0.3.0",
        created_at: "2026-03-01T00:00:00.000Z",
        trustpub_data: options.withTrustpub ? { provider: "github", repository: "stellar/example-crate", run_id: "999", sha: "cccccccccccccccccccccccccccccccccccccccc" } : null,
      },
      { num: "0.2.0", created_at: "2026-02-01T00:00:00.000Z", trustpub_data: null },
      { num: "0.1.0", created_at: "2026-01-01T00:00:00.000Z", trustpub_data: null },
    ],
  };
}

export function unifiedRelease(partial: Partial<UnifiedRelease>): UnifiedRelease {
  return {
    version: "1.0.0",
    publishedAt: "2026-01-01T00:00:00.000Z",
    maintainers: null,
    lifecycleScripts: null,
    npmHasAttestations: false,
    cratesTrustedPublishing: null,
    ...partial,
  };
}

export function noopDeps(): PackageProvenanceDeps {
  return {
    fetchNpmPackage: async () => ({ outcome: "not_found", issues: ["package not found"] }),
    fetchNpmAttestationBundle: async () => ({ outcome: "none" }),
    fetchCratesPackage: async () => ({ outcome: "not_found", issues: ["crate not found"] }),
    fetchGithubTags: async () => ({ outcome: "not_found", issues: ["repository not found"] }),
  };
}

export function request(overrides: Record<string, unknown> = {}) {
  return { registry: "npm", packageName: "@stellar/example-sdk", ...overrides };
}
