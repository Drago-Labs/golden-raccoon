/**
 * Bounded, fail-closed reads from the public npm registry.
 *
 * Redirects are followed manually so each hop is re-checked for a private
 * or local target and for size, mirroring the pattern in
 * `server/research/policy-changes/fetcher.ts`. Unlike that feature's
 * caller-registry-listed URLs, the host here is always the fixed npm
 * registry — the caller only ever supplies the package name, which is
 * validated by `packageIdentity.ts` before it is interpolated into a URL.
 */
import { lookup } from "node:dns/promises";
import { assertExternalFetchAllowed, isPrivateOrLocalHost } from "@/server/security/urlSafety";
import { PACKAGE_PROVENANCE_LIMITS } from "./limits";
import { npmEncodedName } from "./packageIdentity";

export type NpmVersionRecord = {
  version: string;
  publishedAt: string | null;
  maintainers: string[];
  scripts: string[];
  hasAttestations: boolean;
};

export type NpmPackageMetadata = {
  name: string;
  repository: string | null;
  /** Newest first. */
  versions: NpmVersionRecord[];
};

export type NpmFetchOutcome = "ok" | "not_found" | "private_or_local_target" | "oversized" | "timeout" | "http_error" | "dns_failure" | "unsupported_content_type";

export type NpmFetchResult = { outcome: "ok"; packageMeta: NpmPackageMetadata } | { outcome: Exclude<NpmFetchOutcome, "ok">; issues: string[] };

const LIFECYCLE_SCRIPT_KEYS = ["preinstall", "install", "postinstall"];

async function assertResolvedHostIsPublic(url: string): Promise<string[]> {
  const hostname = new URL(url).hostname;
  if (isPrivateOrLocalHost(hostname)) {
    return ["private or localhost target blocked"];
  }
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    const privateAddresses = records.map((record) => record.address).filter(isPrivateOrLocalHost);
    return privateAddresses.length > 0 ? [`DNS resolves to private or local address: ${privateAddresses.join(", ")}`] : [];
  } catch (error) {
    return [`DNS resolution failed: ${error instanceof Error ? error.message : String(error)}`];
  }
}

async function fetchJsonBounded(
  requestedUrl: string,
  fetchImpl: typeof fetch,
): Promise<{ outcome: NpmFetchOutcome; status: number | null; body: unknown; issues: string[] }> {
  const safety = assertExternalFetchAllowed(requestedUrl);
  if (!safety.allowed) {
    const privateHit = safety.issues.some((issue) => issue.includes("private") || issue.includes("localhost"));
    return { outcome: privateHit ? "private_or_local_target" : "http_error", status: null, body: null, issues: safety.issues };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PACKAGE_PROVENANCE_LIMITS.fetchTimeoutMs);

  try {
    let currentUrl = requestedUrl;
    for (let hop = 0; hop <= PACKAGE_PROVENANCE_LIMITS.maxRedirects; hop++) {
      const dnsIssues = await assertResolvedHostIsPublic(currentUrl);
      if (dnsIssues.length > 0) {
        return { outcome: "private_or_local_target", status: null, body: null, issues: dnsIssues };
      }

      const response = await fetchImpl(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: { Accept: "application/json" },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          return { outcome: "http_error", status: response.status, body: null, issues: ["redirect missing location"] };
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (response.status === 404) {
        return { outcome: "not_found", status: 404, body: null, issues: ["package not found"] };
      }
      if (!response.ok) {
        return { outcome: "http_error", status: response.status, body: null, issues: [`HTTP status ${response.status}`] };
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!/application\/json|application\/vnd\.npm/i.test(contentType)) {
        return { outcome: "unsupported_content_type", status: response.status, body: null, issues: [`unsupported content type: ${contentType}`] };
      }

      const text = await response.text();
      if (text.length > PACKAGE_PROVENANCE_LIMITS.maxResponseBytes) {
        return { outcome: "oversized", status: response.status, body: null, issues: ["response size limit exceeded"] };
      }

      try {
        return { outcome: "ok", status: response.status, body: JSON.parse(text), issues: [] };
      } catch (error) {
        return { outcome: "http_error", status: response.status, body: null, issues: [`malformed JSON: ${error instanceof Error ? error.message : String(error)}`] };
      }
    }
    return { outcome: "http_error", status: null, body: null, issues: ["redirect limit exceeded"] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = message.toLowerCase().includes("abort") || message.toLowerCase().includes("timeout");
    return { outcome: timedOut ? "timeout" : "http_error", status: null, body: null, issues: [message] };
  } finally {
    clearTimeout(timer);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function repositoryUrlFrom(version: Record<string, unknown>): string | null {
  const repo = version.repository;
  if (typeof repo === "string") return repo;
  const repoRecord = asRecord(repo);
  return typeof repoRecord.url === "string" ? repoRecord.url : null;
}

export async function fetchNpmPackage(name: string, fetchImpl: typeof fetch = fetch): Promise<NpmFetchResult> {
  const url = `https://registry.npmjs.org/${npmEncodedName(name)}`;
  const result = await fetchJsonBounded(url, fetchImpl);
  if (result.outcome !== "ok") {
    return { outcome: result.outcome, issues: result.issues };
  }

  const doc = asRecord(result.body);
  const versionsById = asRecord(doc.versions);
  const times = asRecord(doc.time);

  const versions: NpmVersionRecord[] = Object.keys(versionsById)
    .map((versionNumber) => {
      const versionDoc = asRecord(versionsById[versionNumber]);
      const maintainersRaw = Array.isArray(versionDoc.maintainers) ? versionDoc.maintainers : [];
      const maintainers = maintainersRaw
        .map((entry) => (typeof entry === "string" ? entry : asRecord(entry).name))
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .sort();
      const scripts = asRecord(versionDoc.scripts);
      const lifecycleScripts = LIFECYCLE_SCRIPT_KEYS.filter((key) => typeof scripts[key] === "string");
      const dist = asRecord(versionDoc.dist);

      return {
        version: versionNumber,
        publishedAt: typeof times[versionNumber] === "string" ? (times[versionNumber] as string) : null,
        maintainers,
        scripts: lifecycleScripts,
        hasAttestations: dist.attestations !== undefined && dist.attestations !== null,
      } satisfies NpmVersionRecord;
    })
    .sort((a, b) => {
      const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return bTime - aTime;
    });

  const latestVersion = typeof asRecord(doc["dist-tags"]).latest === "string" ? (asRecord(doc["dist-tags"]).latest as string) : versions[0]?.version;
  const latestVersionDoc = latestVersion ? asRecord(versionsById[latestVersion]) : {};

  return {
    outcome: "ok",
    packageMeta: {
      name,
      repository: repositoryUrlFrom(latestVersionDoc),
      versions,
    },
  };
}

export type NpmAttestationResult =
  | { outcome: "ok"; sourceRepository: string | null; workflowPath: string | null; commit: string | null; buildRunUrl: string | null }
  | { outcome: "none" }
  | { outcome: "unavailable"; issues: string[] };

function decodeDssePayload(payloadBase64: unknown): Record<string, unknown> | null {
  if (typeof payloadBase64 !== "string") return null;
  try {
    return JSON.parse(Buffer.from(payloadBase64, "base64").toString("utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function fetchNpmAttestationBundle(name: string, version: string, fetchImpl: typeof fetch = fetch): Promise<NpmAttestationResult> {
  const url = `https://registry.npmjs.org/-/npm/v1/attestations/${npmEncodedName(name)}@${encodeURIComponent(version)}`;
  const result = await fetchJsonBounded(url, fetchImpl);

  if (result.outcome === "not_found" || result.outcome === "http_error") {
    return { outcome: "none" };
  }
  if (result.outcome !== "ok") {
    return { outcome: "unavailable", issues: result.issues };
  }

  const doc = asRecord(result.body);
  const attestations = Array.isArray(doc.attestations) ? doc.attestations : [];
  const slsa = attestations.find((entry) => asRecord(entry).predicateType === "https://slsa.dev/provenance/v1");
  if (!slsa) {
    return { outcome: "none" };
  }

  const bundle = asRecord(asRecord(slsa).bundle);
  const envelope = asRecord(bundle.dsseEnvelope);
  const payload = decodeDssePayload(envelope.payload);
  if (!payload) {
    return { outcome: "unavailable", issues: ["attestation payload could not be decoded"] };
  }

  const predicate = asRecord(payload.predicate);
  const buildDefinition = asRecord(predicate.buildDefinition);
  const externalParameters = asRecord(buildDefinition.externalParameters);
  const workflow = asRecord(externalParameters.workflow);
  const resolvedDependencies = Array.isArray(buildDefinition.resolvedDependencies) ? buildDefinition.resolvedDependencies : [];
  const firstDependency = asRecord(resolvedDependencies[0]);
  const digest = asRecord(firstDependency.digest);
  const runDetails = asRecord(predicate.runDetails);
  const metadata = asRecord(runDetails.metadata);

  return {
    outcome: "ok",
    sourceRepository: typeof workflow.repository === "string" ? workflow.repository : null,
    workflowPath: typeof workflow.path === "string" ? workflow.path : null,
    commit: typeof digest.gitCommit === "string" ? digest.gitCommit : null,
    buildRunUrl: typeof metadata.invocationId === "string" ? metadata.invocationId : null,
  };
}
