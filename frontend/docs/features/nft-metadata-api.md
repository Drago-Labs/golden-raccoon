# NFT metadata — API

`POST /api/insights/nft-metadata`

Requires an authenticated wallet session (see `@/server/security/walletSession`); rate-limited to 10 requests/minute per client under the `nft-metadata:read` namespace (each request can make several off-chain fetches with their own timeouts, on top of the on-chain reads).

## Request body

| Field | Type | Required | Notes |
|---|---|---|---|
| `walletAddress` | `string` (EVM address) | yes | Must match the authenticated session wallet. |
| `network` | `string` | yes | One of the networks in `@/lib/evm/config`. |
| `walletNetwork` | `string` | yes | Must equal `network`. |
| `contractAddress` | `string` (EVM address) | yes | The NFT collection to inspect. |
| `tokenIds` | `string[]` | no | Up to 5 token IDs (as decimal strings) to sample; defaults to `["1", "2", "3"]`. |
| `blockNumber` | `number` | no | Defaults to the latest block. |

## Response

`200` with an `NftMetadataResult` body on success; `503` when the provider could not be reached at all (`state: "unavailable"`); `400` for a validated request error; `403` when the wallet session does not authorize the request.

```ts
type HostingClassification = {
  kind: "ipfs" | "arweave" | "onchain" | "http";
  pinned: boolean;
  fetchableUrl: string | null;
  reason: string;
};

type MetadataResolution = {
  uri: string | null;
  hosting: HostingClassification | null;
  resolved: boolean;
  reason: string;
  metadata: { name: string | null; description: string | null; image: string | null; animationUrl: string | null; attributesCount: number | null } | null;
  media: { uri: string; hosting: HostingClassification; resolved: boolean; reason: string } | null;
};

type NftMetadataResult = {
  network: string;
  contractAddress: string;
  state: "complete" | "partial" | "unavailable";
  standard: "erc721" | "erc1155" | "unknown";
  standardDetection: { standard: string; supportsErc165: boolean; erc721MetadataExtension: boolean; erc4906: boolean };
  contractUri: MetadataResolution;
  samples: Array<{ tokenId: string; uri: string | null; resolution: MetadataResolution }>;
  mutability: {
    owner: string | null;
    baseUriSetterSignals: Array<{ name: string; detected: boolean; evidence: string }>;
    freezeFlags: Array<{ name: string; detected: boolean; evidence: string }>;
    metadataUpdateScan: { fromBlock: string; toBlock: string; metadataUpdateCount: number; batchMetadataUpdateCount: number; truncated: boolean };
  };
  coverage: { standardDetected: boolean; sampledTokens: number; resolvedSamples: number; metadataUpdateScanTruncated: boolean };
  warnings: string[];
};
```

`samples` always contains one entry per requested (or default) token ID, even when that token's URI failed to resolve or returned nothing on-chain — an unresolvable sample is reported, never omitted.
