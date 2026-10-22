import { z } from "zod";
import { readPublicHttpsText } from "@/server/security/publicHttpsText";
import { IPFS_GATEWAY, MAX_TREE_BYTES, TREE_FETCH_TIMEOUT_MS } from "./limits";

const BARE_CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[A-Za-z2-7]{20,})$/;

const treeClaimEntrySchema = z.object({
  index: z.number().int().nonnegative(),
  amount: z.string(),
  proof: z.array(z.string().regex(/^0x[0-9a-fA-F]{64}$/)),
});

const merkleTreeFileSchema = z.object({
  merkleRoot: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  tokenTotal: z.string().optional(),
  claims: z.record(z.string(), treeClaimEntrySchema),
});

export type TreeClaimEntry = z.infer<typeof treeClaimEntrySchema>;
export type MerkleTreeFile = z.infer<typeof merkleTreeFileSchema>;

export class TreeLoadError extends Error {}

/**
 * Resolves a user-supplied tree "source" — a full HTTPS URL, an `ipfs://`
 * reference, or a bare IPFS CID — into a fetchable HTTPS URL. A plain
 * (non-HTTPS) `http://` source is rejected, matching this codebase's
 * SSRF-safety policy for externally supplied locations.
 */
export function resolveTreeUrl(source: string): string {
  const trimmed = source.trim();
  if (BARE_CID.test(trimmed)) return `${IPFS_GATEWAY}${trimmed}`;
  if (trimmed.startsWith("ipfs://")) return `${IPFS_GATEWAY}${trimmed.slice("ipfs://".length).replace(/^ipfs\//, "")}`;
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  if (/^http:\/\//i.test(trimmed)) throw new TreeLoadError("Plain HTTP sources are not fetched for safety — use an HTTPS URL or an IPFS reference");
  throw new TreeLoadError("Tree source must be an HTTPS URL, an ipfs:// reference, or a bare IPFS CID");
}

/**
 * Loads and validates a published Merkle tree file — the Uniswap
 * `merkle-distributor`-style generator output (`{ merkleRoot, claims }`,
 * one entry per address with its index, amount, and proof). Size and
 * time are bounded; a response that exceeds either fails closed rather
 * than hanging or exhausting memory.
 */
export async function loadTreeFile(source: string): Promise<MerkleTreeFile> {
  const url = resolveTreeUrl(source);
  let body: string;
  try {
    body = await readPublicHttpsText(url, MAX_TREE_BYTES, TREE_FETCH_TIMEOUT_MS);
  } catch (error) {
    throw new TreeLoadError(error instanceof Error ? error.message : "Failed to fetch the tree file");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new TreeLoadError("Tree file did not parse as JSON");
  }

  const validated = merkleTreeFileSchema.safeParse(parsed);
  if (!validated.success) {
    throw new TreeLoadError("Tree file did not match the expected { merkleRoot, claims } shape");
  }
  return validated.data;
}
