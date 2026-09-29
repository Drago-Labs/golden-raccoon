/**
 * Fixtures for incident-status evidence.
 *
 * Each fixture isolates one claim: rumours cannot acknowledge, copies are not
 * independent advisories, same-name projects stay chain-distinct, and stale or
 * conflicting follow-up stays explicit. Nothing touches a network.
 */
import type { IncidentRequest } from "@/server/research/incident-status/schema";

const OBSERVED_AT = "2026-01-20T12:00:00.000Z";

export const SUBJECT = {
  chainId: "stellar-pubnet",
  protocolId: "bridge-vault-v2",
  displayName: "Bridge Vault",
  issuer: "GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCD",
};

export const OTHER_CHAIN_SUBJECT = {
  chainId: "ethereum",
  protocolId: "bridge-vault-v2",
  displayName: "Bridge Vault",
  contractAddress: "0x1111111111111111111111111111111111111111",
};

/** Rumour claims acknowledgement; must stay reported. */
export const rumorCannotAcknowledge: IncidentRequest = {
  observedAt: OBSERVED_AT,
  staleAfterSeconds: 86_400 * 14,
  subject: SUBJECT,
  documents: [
    {
      documentId: "rumor-1",
      kind: "rumor",
      claimedStatus: "acknowledged",
      title: "Anonymous tip says Bridge Vault patched overnight",
      summary: "Unverified chat message claims the exploit was patched and users were repaid.",
      domain: "rumor.example",
      publishedAt: "2026-01-18T08:00:00.000Z",
      url: "https://rumor.example/posts/bridge-patched",
    },
    {
      documentId: "news-1",
      kind: "news_report",
      claimedStatus: "reported",
      title: "Researchers disclose Bridge Vault exploit",
      summary: "Independent security researchers published exploit details and urged caution.",
      domain: "news.example",
      publishedAt: "2026-01-17T10:00:00.000Z",
      url: "https://news.example/bridge-vault-exploit",
    },
  ],
};

/** Official advisory acknowledges; remediation update mitigates. */
export const statusRevisionOfficial: IncidentRequest = {
  observedAt: OBSERVED_AT,
  staleAfterSeconds: 86_400 * 14,
  subject: SUBJECT,
  documents: [
    {
      documentId: "news-report",
      kind: "news_report",
      claimedStatus: "reported",
      title: "Exploit reported against Bridge Vault",
      summary: "Media report summarises the disclosed vulnerability without an official response.",
      domain: "news.example",
      publishedAt: "2026-01-10T09:00:00.000Z",
      url: "https://news.example/bridge-reported",
    },
    {
      documentId: "advisory-ack",
      kind: "official_advisory",
      authority: "official",
      claimedStatus: "acknowledged",
      title: "Bridge Vault security advisory",
      summary: "The project acknowledges the incident and asks users to pause deposits.",
      domain: "bridge.example",
      outletId: "bridge-official",
      publishedAt: "2026-01-11T12:00:00.000Z",
      updatedAt: "2026-01-11T12:00:00.000Z",
      url: "https://bridge.example/security/advisory-1",
    },
    {
      documentId: "remediation",
      kind: "remediation_update",
      authority: "official",
      claimedStatus: "mitigated",
      title: "Bridge Vault remediation complete",
      summary: "Contracts upgraded and affected users compensated according to the published plan.",
      domain: "bridge.example",
      outletId: "bridge-official",
      publishedAt: "2026-01-15T16:00:00.000Z",
      updatedAt: "2026-01-15T16:00:00.000Z",
      url: "https://bridge.example/security/remediation-1",
    },
  ],
};

/** Duplicate articles sharing a canonical URL. */
export const duplicateArticles: IncidentRequest = {
  observedAt: OBSERVED_AT,
  subject: SUBJECT,
  documents: [
    {
      documentId: "wire-original",
      kind: "news_report",
      claimedStatus: "reported",
      title: "Bridge Vault funds moved by attacker",
      summary: "Wire story describing the exploit transaction and affected pools in detail for readers.",
      domain: "wire.example",
      publishedAt: "2026-01-12T08:00:00.000Z",
      url: "https://wire.example/story/bridge?utm_source=twitter",
    },
    {
      documentId: "wire-copy",
      kind: "news_report",
      claimedStatus: "reported",
      title: "Bridge Vault funds moved by attacker",
      summary: "Wire story describing the exploit transaction and affected pools in detail for readers.",
      domain: "mirror.example",
      publishedAt: "2026-01-12T09:00:00.000Z",
      url: "https://wire.example/story/bridge",
      syndicatedFrom: "wire.example",
    },
  ],
};

/** Two official sources disagree on mitigation vs reopened. */
export const conflictingOfficialSources: IncidentRequest = {
  observedAt: OBSERVED_AT,
  subject: SUBJECT,
  documents: [
    {
      documentId: "official-mitigated",
      kind: "project_statement",
      authority: "official",
      claimedStatus: "mitigated",
      title: "Incident closed after upgrade",
      summary: "Project states the vulnerability is patched and monitoring continues.",
      domain: "bridge.example",
      outletId: "bridge-official",
      publishedAt: "2026-01-16T10:00:00.000Z",
      url: "https://bridge.example/status/closed",
    },
    {
      documentId: "auditor-reopened",
      kind: "official_advisory",
      authority: "official",
      claimedStatus: "reopened",
      title: "Auditor finds residual path",
      summary: "Independent auditor advisory says a residual attack path remains open.",
      domain: "auditor.example",
      outletId: "auditor-official",
      publishedAt: "2026-01-17T11:00:00.000Z",
      url: "https://auditor.example/advisories/bridge-residual",
    },
  ],
};

/** Stale mitigation with no fresh follow-up. */
export const staleUpdate: IncidentRequest = {
  observedAt: OBSERVED_AT,
  staleAfterSeconds: 86_400 * 7,
  subject: SUBJECT,
  documents: [
    {
      documentId: "old-mitigation",
      kind: "official_advisory",
      authority: "official",
      claimedStatus: "mitigated",
      title: "Old mitigation notice",
      summary: "Advisory from before the freshness window claiming the issue was fixed.",
      domain: "bridge.example",
      publishedAt: "2025-12-01T10:00:00.000Z",
      updatedAt: "2025-12-01T10:00:00.000Z",
      url: "https://bridge.example/security/old",
    },
  ],
};

/** Same display name on another chain must not merge. */
export const sameNameDifferentChain: IncidentRequest = {
  observedAt: OBSERVED_AT,
  subject: SUBJECT,
  documents: [
    {
      documentId: "stellar-doc",
      kind: "official_advisory",
      authority: "official",
      claimedStatus: "acknowledged",
      title: "Stellar Bridge Vault advisory",
      summary: "Advisory that applies only to the Stellar deployment of Bridge Vault.",
      domain: "bridge.example",
      publishedAt: "2026-01-14T10:00:00.000Z",
      url: "https://bridge.example/stellar/advisory",
      subject: SUBJECT,
    },
    {
      documentId: "eth-doc",
      kind: "official_advisory",
      authority: "official",
      claimedStatus: "mitigated",
      title: "Ethereum Bridge Vault advisory",
      summary: "Advisory that applies only to the Ethereum deployment of Bridge Vault.",
      domain: "bridge.example",
      publishedAt: "2026-01-14T11:00:00.000Z",
      url: "https://bridge.example/eth/advisory",
      subject: OTHER_CHAIN_SUBJECT,
    },
  ],
};

export const emptyIncident: IncidentRequest = {
  observedAt: OBSERVED_AT,
  subject: SUBJECT,
  documents: [],
};
