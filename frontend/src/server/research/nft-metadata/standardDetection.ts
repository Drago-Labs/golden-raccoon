import { callSupportsInterface, type NftRpc } from "./uriReader";

/** Well-known ERC-165 interface IDs. For a single-function interface this equals that function's own 4-byte selector. */
export const INTERFACE_IDS = {
  erc721: "0x80ac58cd",
  erc721Metadata: "0x5b5e139f",
  erc1155: "0xd9b67a26",
  erc1155MetadataUri: "0x0e89341c",
  erc4906: "0x49064906",
} as const satisfies Record<string, `0x${string}`>;

export type DetectedStandard = "erc721" | "erc1155" | "unknown";

export type StandardDetectionResult = {
  standard: DetectedStandard;
  supportsErc165: boolean;
  erc721MetadataExtension: boolean;
  erc4906: boolean;
};

/**
 * Detects ERC-721 vs ERC-1155 via `supportsInterface` (ERC-165). A contract
 * that does not implement ERC-165 at all is reported as `"unknown"` rather
 * than guessed at from behavior — pre-165 tokens exist, but this feature
 * only trusts the standard's own self-declaration.
 */
export async function detectStandard(rpc: NftRpc, address: string, block: bigint): Promise<StandardDetectionResult> {
  const [isErc721, isErc1155] = await Promise.all([
    callSupportsInterface(rpc, address, INTERFACE_IDS.erc721, block),
    callSupportsInterface(rpc, address, INTERFACE_IDS.erc1155, block),
  ]);

  if (isErc721 !== true && isErc1155 !== true) {
    return { standard: "unknown", supportsErc165: isErc721 !== null || isErc1155 !== null, erc721MetadataExtension: false, erc4906: false };
  }

  const standard: DetectedStandard = isErc1155 === true ? "erc1155" : "erc721";
  const [metadataExtension, erc4906] = await Promise.all([
    standard === "erc721"
      ? callSupportsInterface(rpc, address, INTERFACE_IDS.erc721Metadata, block)
      : callSupportsInterface(rpc, address, INTERFACE_IDS.erc1155MetadataUri, block),
    callSupportsInterface(rpc, address, INTERFACE_IDS.erc4906, block),
  ]);

  return {
    standard,
    supportsErc165: true,
    erc721MetadataExtension: metadataExtension === true,
    erc4906: erc4906 === true,
  };
}
