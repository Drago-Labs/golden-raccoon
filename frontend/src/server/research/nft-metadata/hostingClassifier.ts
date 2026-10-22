import { ARWEAVE_GATEWAY, IPFS_GATEWAY } from "./limits";

export type HostingKind = "ipfs" | "arweave" | "onchain" | "http";

export type HostingClassification = {
  kind: HostingKind;
  /** Content-addressed: the location is derived from the content itself, so it cannot be silently swapped without also changing the URI. */
  pinned: boolean;
  /** An HTTPS URL this feature is willing to fetch, or `null` when the reference is not externally fetchable (on-chain) or not safely fetchable (plain HTTP). */
  fetchableUrl: string | null;
  reason: string;
};

/** CIDv0 (`Qm...`, base58) or CIDv1 (`b...`, base32) segment inside an `/ipfs/<cid>` gateway path. */
const CID_SEGMENT = /\/ipfs\/(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[A-Za-z2-7]{20,})(?:[/?]|$)/;

function translateIpfsUri(uri: string): string {
  const withoutScheme = uri.slice("ipfs://".length).replace(/^ipfs\//, "");
  return `${IPFS_GATEWAY}${withoutScheme}`;
}

function translateArweaveUri(uri: string): string {
  return `${ARWEAVE_GATEWAY}${uri.slice("ar://".length)}`;
}

/**
 * Classifies a `tokenURI`/`uri`/`contractURI` value into one of the four
 * buckets this feature reports on, and — where applicable — a gateway URL
 * this feature is willing to fetch. HTTP(S) gateway paths that embed a CID
 * are still "pinned", since the gateway is only a transport, not the
 * content's location of record.
 */
export function classifyHosting(uri: string): HostingClassification {
  const trimmed = uri.trim();

  if (trimmed.startsWith("ipfs://")) {
    return { kind: "ipfs", pinned: true, fetchableUrl: translateIpfsUri(trimmed), reason: "ipfs:// URI, content-addressed by CID" };
  }

  if (trimmed.startsWith("ar://")) {
    return { kind: "arweave", pinned: true, fetchableUrl: translateArweaveUri(trimmed), reason: "ar:// URI, content-addressed by transaction ID" };
  }

  if (trimmed.startsWith("data:")) {
    return { kind: "onchain", pinned: true, fetchableUrl: null, reason: "data: URI, content lives inline in the contract's own return value" };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const cidMatch = CID_SEGMENT.exec(trimmed);
    if (cidMatch) {
      return { kind: "ipfs", pinned: true, fetchableUrl: trimmed, reason: `HTTP gateway path pinned to CID ${cidMatch[1]}` };
    }
    const isHttps = /^https:\/\//i.test(trimmed);
    return {
      kind: "http",
      pinned: false,
      fetchableUrl: isHttps ? trimmed : null,
      reason: isHttps
        ? "plain HTTPS path with no content address — the host can change what it serves without changing the URI"
        : "plain HTTP (not HTTPS) path — not fetched for safety, and not content-addressed",
    };
  }

  return { kind: "http", pinned: false, fetchableUrl: null, reason: "unrecognized or malformed URI, treated as an opaque mutable reference" };
}
