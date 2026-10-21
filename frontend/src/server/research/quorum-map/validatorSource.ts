import { QuorumMapError } from "./errors";
import { QUORUM_LIMITS } from "./limits";
import { tomlUrl, validatorDirectoryUrl, type StellarNetwork } from "./networkIdentity";
import { parseTomlValidators, type TomlValidator } from "./tomlValidators";

export type DirectoryNode = {
  publicKey: string;
  organization: string | null;
  homeDomain: string | null;
  quorumSet: unknown;
};

export type ValidatorSnapshot = {
  directory: { name: string; fetchedAt: string };
  nodes: DirectoryNode[];
  toml: TomlValidator[];
  tomlFailures: Array<{ name: string; fetchedAt: string | null; reason: string }>;
};

export type ReadOutcome<T> = { status: "ok"; value: T } | { status: "unavailable"; reason: string };

async function readText(url: string, fetchImpl: typeof fetch): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QUORUM_LIMITS.timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { accept: "application/json,text/plain" } });
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };
    const text = await response.text();
    if (text.length > QUORUM_LIMITS.maxResponseBytes) {
      throw new QuorumMapError("response_too_large", "The provider response exceeded the size limit.");
    }
    return { ok: true, text };
  } catch (error) {
    if (error instanceof QuorumMapError) throw error;
    return { ok: false, reason: error instanceof Error ? error.message : "The provider request failed." };
  } finally {
    clearTimeout(timer);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function nodeFrom(value: unknown): DirectoryNode | null {
  const record = asRecord(value);
  const publicKey = record?.publicKey ?? record?.public_key;
  if (typeof publicKey !== "string") return null;
  const organization = record?.organization ?? record?.organizationId;
  return {
    publicKey,
    organization: typeof organization === "string" ? organization : null,
    homeDomain: typeof record?.homeDomain === "string" ? record.homeDomain : typeof record?.home_domain === "string" ? record.home_domain : null,
    quorumSet: record?.quorumSet ?? record?.quorum_set ?? null,
  };
}

/** Fetch the configured directory and each validator home-domain stellar.toml. */
export async function readValidatorSnapshot(
  network: StellarNetwork,
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
): Promise<ReadOutcome<ValidatorSnapshot>> {
  const directoryUrl = validatorDirectoryUrl(network);
  const directory = await readText(directoryUrl, fetchImpl);
  if (!directory.ok) return { status: "unavailable", reason: directory.reason };
  let body: unknown;
  try {
    body = JSON.parse(directory.text) as unknown;
  } catch {
    return { status: "unavailable", reason: "The validator directory was not JSON." };
  }
  const root = asRecord(body);
  const rawNodes = Array.isArray(root?.nodes) ? root.nodes : Array.isArray(body) ? body : null;
  if (!rawNodes) return { status: "unavailable", reason: "The validator directory did not include nodes." };
  const nodes = rawNodes.flatMap((entry) => {
    const node = nodeFrom(entry);
    return node ? [node] : [];
  });
  const fetchedAt = typeof root?.fetchedAt === "string" ? root.fetchedAt : now.toISOString();
  const domains = [...new Set(nodes.map((node) => node.homeDomain).filter((domain): domain is string => Boolean(domain)))].slice(0, QUORUM_LIMITS.maxTomlFetches);
  const toml: TomlValidator[] = [];
  const tomlFailures: ValidatorSnapshot["tomlFailures"] = [];
  for (const domain of domains) {
    const url = tomlUrl(domain);
    const document = await readText(url, fetchImpl);
    if (!document.ok) {
      tomlFailures.push({ name: url, fetchedAt: null, reason: document.reason });
      continue;
    }
    const tomlFetchedAt = now.toISOString();
    toml.push(...parseTomlValidators(document.text, url, tomlFetchedAt));
  }
  return { status: "ok", value: { directory: { name: directoryUrl, fetchedAt }, nodes, toml, tomlFailures } };
}
