import { describe, expect, it } from "vitest";
import { detectStandard } from "@/server/research/nft-metadata/standardDetection";
import { contractAddress, nftReader } from "./fixtures";

describe("detectStandard", () => {
  it("detects ERC-721 and its metadata extension", async () => {
    const rpc = nftReader({ standard: "erc721", erc721MetadataExtension: true, erc4906: true });
    const result = await detectStandard(rpc, contractAddress, 100n);
    expect(result).toEqual({ standard: "erc721", supportsErc165: true, erc721MetadataExtension: true, erc4906: true });
  });

  it("detects ERC-1155 and its metadata extension", async () => {
    const rpc = nftReader({ standard: "erc1155", erc721MetadataExtension: true, erc4906: false });
    const result = await detectStandard(rpc, contractAddress, 100n);
    expect(result).toEqual({ standard: "erc1155", supportsErc165: true, erc721MetadataExtension: true, erc4906: false });
  });

  it("reports unknown, not a guess, when the contract does not implement ERC-165 at all", async () => {
    const rpc = nftReader({ standard: "unknown" });
    const result = await detectStandard(rpc, contractAddress, 100n);
    expect(result.standard).toBe("unknown");
    expect(result.supportsErc165).toBe(false);
  });

  it("reports the metadata extension as absent when ERC-165 responds but that interface is not declared", async () => {
    const rpc = nftReader({ standard: "erc721", erc721MetadataExtension: false });
    const result = await detectStandard(rpc, contractAddress, 100n);
    expect(result.standard).toBe("erc721");
    expect(result.erc721MetadataExtension).toBe(false);
  });
});
