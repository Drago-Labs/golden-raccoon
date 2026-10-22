# Merkle claims — API

`POST /api/insights/merkle-claims`

Requires an authenticated wallet session (see `@/server/security/walletSession`); rate-limited to 10 requests/minute per client under the `merkle-claims:read` namespace.

## Request body

| Field | Type | Required | Notes |
|---|---|---|---|
| `walletAddress` | `string` (EVM address) | yes | Must match the authenticated session wallet. |
| `network` | `string` | yes | One of the networks in `@/lib/evm/config`. |
| `walletNetwork` | `string` | yes | Must equal `network`. |
| `distributorAddress` | `string` (EVM address) | yes | The Merkle distributor contract. |
| `claimAddress` | `string` (EVM address) | yes | The address whose claim is checked — not necessarily the connected wallet, since this is a public, read-only lookup. |
| `treeSource` | `string` | yes | An HTTPS URL, an `ipfs://` reference, or a bare IPFS CID for the published tree file. |
| `leafEncoding` | `"index-account-amount-packed" \| "account-amount-packed" \| "account-amount-abi-double-hashed"` | yes | Which leaf encoding this distributor uses. No default — must be selected explicitly. |
| `blockNumber` | `number` | no | Defaults to the latest block. |

## Response

`200` with a `MerkleClaimsResult` body on success; `503` when the provider could not be reached at all (`state: "unavailable"`); `400` for a validated request error; `403` when the wallet session does not authorize the request.

```ts
type MerkleClaimsResult = {
  network: string;
  distributorAddress: string;
  claimAddress: string;
  state: "complete" | "partial" | "unavailable";
  onChainRoot: string | null;
  token: string | null;
  tree: {
    loaded: boolean;
    source: string;
    fileReportedRoot: string | null;
    entryIndex: number | null;
    entryAmount: string | null;
    proofLength: number | null;
  };
  proof: { leaf: string | null; computedRoot: string | null; valid: boolean; reason: string };
  claim: {
    inTree: boolean;
    proofValid: boolean;
    fileReportedRootMatchesChain: boolean | null;
    alreadyClaimed: boolean | null;
    eligible: boolean;
    reason: string;
  };
  coverage: { onChainRootRead: boolean; treeLoaded: boolean; proofChecked: boolean; claimStatusRead: boolean };
  warnings: string[];
};
```

`claim.eligible` is `true` only when the address is in the tree, its proof folds up to the on-chain root, and it has not already been claimed (or claimed status could not be read, in which case the reason notes that caveat explicitly). A root mismatch (`proof.valid === false`) always makes `claim.eligible` `false`, regardless of `claim.fileReportedRootMatchesChain`.
