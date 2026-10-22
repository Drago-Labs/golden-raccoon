import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeployerProfile } from "@/components/research/deployer-history/DeployerProfile";
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
  lookup: { deployer: wallet, creationBlock: 100, creationTxHash: "0xcreate", direct: true },
  deployments: [{ address: "0x2222222222222222222222222222222222222222", blockNumber: 105, txHash: "0xb", codeHash: "0xhash" }],
  templateGroups: [{ codeHash: "0xhash", deployments: [contractAddress, "0x2222222222222222222222222222222222222222"] }],
  fundingTrail: [{ hop: 1, address: wallet, transactions: [{ from: "0x3333333333333333333333333333333333333333", to: wallet, blockNumber: 95, txHash: "0xf", valueWei: "0xde0b6b3a7640000" }] }],
  flaggedMatches: [],
  coverage: { deployerFound: true, deploymentScan: { fromBlock: 80, toBlock: 120, truncated: false }, fundingHopsRequested: 2, fundingHopsCompleted: 1 },
  warnings: [],
};

describe("DeployerProfile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    walletMock.address = wallet;
  });

  it("exposes an accessible form, submits, and renders results by role rather than styling", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(completeResult), { status: 200, headers: { "content-type": "application/json" } }),
    );

    render(<DeployerProfile />);
    fireEvent.change(screen.getByLabelText("Contract address"), { target: { value: contractAddress } });
    fireEvent.click(screen.getByRole("button", { name: "Profile deployer" }));

    await waitFor(() => expect(screen.getByRole("region", { name: "Deployer history results" })).toBeTruthy());
    expect(screen.getAllByText(wallet).length).toBeGreaterThan(0);
    expect(screen.getByText(/deployments share this exact runtime code/)).toBeTruthy();
    expect(screen.getByText("Coverage")).toBeTruthy();
  });

  it("shows a non-styling explanation when the deployer could not be determined", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ...completeResult,
          state: "partial",
          lookup: { deployer: null, creationBlock: 100, creationTxHash: null, direct: false },
          deployments: [],
          templateGroups: [],
          fundingTrail: [],
          warnings: ["Could not determine the deployer directly: the contract was likely created through a factory."],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    render(<DeployerProfile />);
    fireEvent.change(screen.getByLabelText("Contract address"), { target: { value: contractAddress } });
    fireEvent.click(screen.getByRole("button", { name: "Profile deployer" }));

    await waitFor(() => expect(screen.getByText(/could not be determined directly/i)).toBeTruthy());
    expect(screen.queryByText(/deployments share this exact runtime code/)).toBeNull();
  });

  it("shows an alert on failure and never renders a mutating action", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "provider_unavailable", message: "Provider rate limited" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );

    render(<DeployerProfile />);
    fireEvent.change(screen.getByLabelText("Contract address"), { target: { value: contractAddress } });
    fireEvent.click(screen.getByRole("button", { name: "Profile deployer" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("Provider rate limited");
    // The only button on this read-only page is the submit action itself —
    // no mutating action (sign, confirm, approve) is ever rendered.
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Profile deployer"]);
  });

  it("disables submission when no wallet is connected", () => {
    walletMock.address = "";
    render(<DeployerProfile />);
    const submitButton = screen.getByRole("button", { name: "Profile deployer" }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
  });
});
