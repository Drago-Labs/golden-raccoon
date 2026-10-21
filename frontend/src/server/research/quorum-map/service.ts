import { coverageNotice, sourceAgeSeconds } from "./coverage";
import { organizationDependencies } from "./dependency";
import { QuorumMapError, type QuorumState } from "./errors";
import { QUORUM_LIMITS } from "./limits";
import type { StellarNetwork } from "./networkIdentity";
import { unresolvedKeys, type ValidatorNode } from "./organizationMap";
import { parseQuorumSet } from "./quorumParser";
import { QUORUM_SCHEMA_VERSION, quorumRequestSchema, type QuorumReport, type SourceRecord } from "./schema";
import { compareToml, type TomlValidator } from "./tomlValidators";
import { readValidatorSnapshot, type ReadOutcome, type ValidatorSnapshot } from "./validatorSource";

export type QuorumDeps = {
  readSnapshot: (network: StellarNetwork) => Promise<ReadOutcome<ValidatorSnapshot>>;
};

const productionDeps: QuorumDeps = {
  readSnapshot: (network) => readValidatorSnapshot(network),
};

function sourceRecord(name: string, fetchedAt: string | null, now: Date, unavailable: boolean): SourceRecord {
  const ageSeconds = sourceAgeSeconds(fetchedAt, now);
  return {
    name,
    fetchedAt,
    ageSeconds,
    stale: ageSeconds === null || ageSeconds > QUORUM_LIMITS.staleAfterSeconds,
    unavailable,
  };
}

function unavailableReport(network: StellarNetwork, reason: string): QuorumReport {
  return {
    schemaVersion: QUORUM_SCHEMA_VERSION,
    network,
    state: "unavailable",
    organizations: [],
    unresolvedKeys: [],
    disagreements: [],
    quorumSets: [],
    sources: [],
    coverageNotice: `${coverageNotice("unavailable", 0)} ${reason}`,
    provesSafety: false,
    readOnly: true,
  };
}

/**
 * Map organizations inside declared quorum sets. The result is dependency evidence.
 * It does not prove that the network is safe.
 */
export async function mapQuorum(input: unknown, deps: QuorumDeps = productionDeps, now = new Date()): Promise<QuorumReport> {
  const parsed = quorumRequestSchema.safeParse(input);
  if (!parsed.success) throw new QuorumMapError("invalid_request", "The quorum request is invalid.", parsed.error.flatten());
  const { network } = parsed.data;
  const snapshot = await deps.readSnapshot(network);
  if (snapshot.status !== "ok") return unavailableReport(network, snapshot.reason);

  const reasons: string[] = [];
  const nodes: ValidatorNode[] = [];
  const quorumSets: QuorumReport["quorumSets"] = [];
  const limited = snapshot.value.nodes.slice(0, QUORUM_LIMITS.maxNodes);
  if (limited.length < snapshot.value.nodes.length) reasons.push("The node list was truncated.");

  for (const node of limited) {
    if (!node.quorumSet) {
      nodes.push({ publicKey: node.publicKey, organization: node.organization, homeDomain: node.homeDomain, quorumSet: null });
      continue;
    }
    try {
      const parsedSet = parseQuorumSet(node.quorumSet);
      if (parsedSet.truncated) reasons.push(`Quorum set for ${node.publicKey} was truncated at the depth limit.`);
      nodes.push({ publicKey: node.publicKey, organization: node.organization, homeDomain: node.homeDomain, quorumSet: parsedSet.set });
      quorumSets.push({ owner: node.publicKey, set: parsedSet.set });
    } catch {
      reasons.push(`Quorum set for ${node.publicKey} could not be parsed.`);
      nodes.push({ publicKey: node.publicKey, organization: node.organization, homeDomain: node.homeDomain, quorumSet: null });
    }
  }

  const sources = [
    sourceRecord(snapshot.value.directory.name, snapshot.value.directory.fetchedAt, now, false),
    ...snapshot.value.tomlFailures.map((failure) => sourceRecord(failure.name, failure.fetchedAt, now, true)),
  ];
  const tomlBySource = new Map<string, string | null>();
  for (const row of snapshot.value.toml) {
    if (!tomlBySource.has(row.source)) tomlBySource.set(row.source, row.fetchedAt);
  }
  for (const [name, fetchedAt] of tomlBySource) sources.push(sourceRecord(name, fetchedAt, now, false));
  if (sources.some((source) => source.stale || source.unavailable) || snapshot.value.tomlFailures.length > 0) {
    reasons.push("A validator source is stale or unavailable.");
  }

  const disagreements = compareToml(nodes, snapshot.value.toml as TomlValidator[]);
  const state: QuorumState = reasons.length > 0 ? "partial" : "complete";
  const staleSources = sources.filter((source) => source.stale || source.unavailable).length;
  return {
    schemaVersion: QUORUM_SCHEMA_VERSION,
    network,
    state,
    organizations: organizationDependencies(nodes),
    unresolvedKeys: unresolvedKeys(nodes),
    disagreements,
    quorumSets,
    sources,
    coverageNotice: coverageNotice(state, staleSources),
    provesSafety: false,
    readOnly: true,
  };
}
