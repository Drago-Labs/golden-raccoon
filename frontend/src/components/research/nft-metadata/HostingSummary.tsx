import type { NftMetadataResult } from "@/server/research/nft-metadata";

const STANDARD_LABELS: Record<NftMetadataResult["standard"], string> = {
  erc721: "ERC-721",
  erc1155: "ERC-1155",
  unknown: "Could not detect (no ERC-165 response)",
};

export function HostingSummary(props: { result: NftMetadataResult }) {
  const { result } = props;
  const { contractUri } = result;

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-white/50">Standard</dt>
          <dd>{STANDARD_LABELS[result.standard]}</dd>
        </div>
        <div>
          <dt className="text-white/50">ERC-4906 (MetadataUpdate) support</dt>
          <dd>{result.standardDetection.erc4906 ? "Declared" : "Not declared"}</dd>
        </div>
        <div>
          <dt className="text-white/50">Metadata-extension support</dt>
          <dd>{result.standardDetection.erc721MetadataExtension ? "Declared" : "Not declared"}</dd>
        </div>
      </dl>

      <div className="rounded-lg border border-white/10 p-4 text-sm">
        <h3 className="font-medium">contractURI()</h3>
        {!contractUri.uri ? (
          <p className="mt-1 text-xs text-white/55">Not implemented or returned nothing.</p>
        ) : (
          <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-white/50">URI</dt>
              <dd className="break-all font-mono">{contractUri.uri}</dd>
            </div>
            <div>
              <dt className="text-white/50">Hosting</dt>
              <dd>
                {contractUri.hosting?.kind ?? "unknown"} — {contractUri.hosting?.pinned ? "content-addressed (pinned)" : "mutable path"}
              </dd>
            </div>
            <div>
              <dt className="text-white/50">Resolved</dt>
              <dd className={contractUri.resolved ? "" : "text-amber-300"}>{contractUri.resolved ? "Yes" : `No — ${contractUri.reason}`}</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
