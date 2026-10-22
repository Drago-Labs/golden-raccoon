import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NftMetadataInspector } from "@/components/research/nft-metadata/NftMetadataInspector";
import { wallet } from "./fixtures";

const walletMock = vi.hoisted(() => ({ address: "0x9999999999999999999999999999999999999999" }));
vi.mock("@/hooks/useWalletSession", () => ({
  useWalletSession: () => ({ family: "evm", address: walletMock.address, isConnected: true }),
}));

const contractAddress = "0x1111111111111111111111111111111111111111";

const completeResult = {
  network: "ethereum",
  contractAddress,
  state: "complete",
  standard: "erc721",
  standardDetection: { standard: "erc721", supportsErc165: true, erc721MetadataExtension: true, erc4906: true },
  contractUri: {
    uri: "ipfs://bafycid/collection.json",
    hosting: { kind: "ipfs", pinned: true, fetchableUrl: "https://ipfs.io/ipfs/bafycid/collection.json", reason: "ipfs:// URI" },
    resolved: true,
    reason: "resolved",
    metadata: { name: "Collection", description: null, image: null, animationUrl: null, attributesCount: null },
    media: null,
  },
  samples: [
    {
      tokenId: "1",
      uri: "ipfs://bafycid/1.json",
      resolution: {
        uri: "ipfs://bafycid/1.json",
        hosting: { kind: "ipfs", pinned: true, fetchableUrl: "https://ipfs.io/ipfs/bafycid/1.json", reason: "ipfs:// URI" },
        resolved: true,
        reason: "resolved",
        metadata: { name: "Token 1", description: null, image: "ipfs://bafycid/1.png", animationUrl: null, attributesCount: 0 },
        media: {
          uri: "ipfs://bafycid/1.png",
          hosting: { kind: "ipfs", pinned: true, fetchableUrl: "https://ipfs.io/ipfs/bafycid/1.png", reason: "ipfs:// URI" },
          resolved: true,
          reason: "resolved",
        },
      },
    },
  ],
  mutability: {
    owner: wallet,
    baseUriSetterSignals: [{ name: "setBaseURI(string)", detected: false, evidence: "no evidence either way" }],
    freezeFlags: [{ name: "isFrozen()", detected: true, evidence: "present, reports frozen" }],
    metadataUpdateScan: { fromBlock: "0", toBlock: "100", metadataUpdateCount: 0, batchMetadataUpdateCount: 0, truncated: false },
  },
  coverage: { standardDetected: true, sampledTokens: 1, resolvedSamples: 1, metadataUpdateScanTruncated: false },
  warnings: [],
};

describe("NftMetadataInspector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    walletMock.address = wallet;
  });

  it("exposes an accessible form, submits, and renders results by role rather than styling", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(completeResult), { status: 200, headers: { "content-type": "application/json" } }),
    );

    render(<NftMetadataInspector />);
    fireEvent.change(screen.getByLabelText("Collection address"), { target: { value: contractAddress } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect collection" }));

    await waitFor(() => expect(screen.getByRole("region", { name: "NFT metadata results" })).toBeTruthy());
    expect(screen.getByText("ERC-721")).toBeTruthy();
    expect(screen.getAllByText(wallet).length).toBeGreaterThan(0);
    expect(screen.getByText("Coverage")).toBeTruthy();
  });

  it("shows an alert on failure and never renders a mutating action", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "provider_unavailable", message: "Provider rate limited" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );

    render(<NftMetadataInspector />);
    fireEvent.change(screen.getByLabelText("Collection address"), { target: { value: contractAddress } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect collection" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("Provider rate limited");
    // The only button on this read-only page is the submit action itself —
    // no mutating action (sign, confirm, approve) is ever rendered.
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Add", "Inspect collection"]);
  });

  it("shows an unresolved sample as a failure row rather than hiding it", async () => {
    const partial = {
      ...completeResult,
      state: "partial",
      samples: [
        {
          tokenId: "2",
          uri: "ipfs://bafycid/2.json",
          resolution: {
            uri: "ipfs://bafycid/2.json",
            hosting: { kind: "ipfs", pinned: true, fetchableUrl: "https://ipfs.io/ipfs/bafycid/2.json", reason: "ipfs:// URI" },
            resolved: false,
            reason: "HTTP 404",
            metadata: null,
            media: null,
          },
        },
      ],
      warnings: ["contractURI did not resolve: HTTP 404"],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(partial), { status: 200, headers: { "content-type": "application/json" } }),
    );

    render(<NftMetadataInspector />);
    fireEvent.change(screen.getByLabelText("Collection address"), { target: { value: contractAddress } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect collection" }));

    await waitFor(() => expect(screen.getByText("2")).toBeTruthy());
    expect(screen.getByText(/No — HTTP 404/)).toBeTruthy();
  });

  it("disables submission when no wallet is connected", () => {
    walletMock.address = "";
    render(<NftMetadataInspector />);
    const submitButton = screen.getByRole("button", { name: "Inspect collection" }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
  });
});
