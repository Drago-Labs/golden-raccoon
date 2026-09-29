import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorityHistory } from "@/components/research/authority-history/AuthorityHistory";
import { contract, ownerNew, roleAccount, walletA, walletB, MINTER_ROLE } from "./fixtures";

const walletMock = vi.hoisted(() => ({ address: "0x1111111111111111111111111111111111111111" }));
vi.mock("@/hooks/useWalletSession", () => ({
  useWalletSession: () => ({ family: "evm", address: walletMock.address, isConnected: true }),
}));

function completeReport() {
  return {
    schemaVersion: "authority-history/2026-01",
    walletAddress: walletA,
    network: "ethereum",
    contractAddress: contract,
    generatedAt: "2026-01-01T00:00:00Z",
    events: [
      {
        kind: "OwnershipTransferred",
        family: "application",
        network: "ethereum",
        contractAddress: contract,
        blockNumber: "100",
        blockHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        transactionHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
        logIndex: 0,
        transactionUrl: "https://etherscan.io/tx/0x1111111111111111111111111111111111111111111111111111111111111111",
        previousOwner: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        newOwner: ownerNew,
        roleId: null,
        account: null,
        sender: null,
        previousAdminRole: null,
        newAdminRole: null,
        previousAdmin: null,
        newAdmin: null,
      },
      {
        kind: "RoleGranted",
        family: "application",
        network: "ethereum",
        contractAddress: contract,
        blockNumber: "101",
        blockHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        transactionHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
        logIndex: 0,
        transactionUrl: "https://etherscan.io/tx/0x2222222222222222222222222222222222222222222222222222222222222222",
        previousOwner: null,
        newOwner: null,
        roleId: MINTER_ROLE,
        account: roleAccount,
        sender: ownerNew,
        previousAdminRole: null,
        newAdminRole: null,
        previousAdmin: null,
        newAdmin: null,
      },
    ],
    timeline: [] as unknown[],
    roleMatrix: [{ roleId: MINTER_ROLE, account: roleAccount, family: "application", reconstructed: true }],
    roleAdmins: [],
    observedOwners: [{ address: ownerNew, family: "application", reconstructed: true, evidenceEventIndex: 0 }],
    coverage: {
      state: "complete",
      fromBlock: "0",
      toBlock: "1000",
      snapshotBlock: "1000",
      eventCount: 2,
      truncated: false,
      logCoverageComplete: true,
      reorgDetected: false,
      missingBlockHashes: 0,
      unsupportedModels: [],
      providerLimitations: [],
      reconstructionValid: true,
      message: "Every block in the requested range was readable and hashes still match.",
    },
    readOnly: true,
    authorityUnchanged: true,
  };
}

describe("AuthorityHistory workspace", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    walletMock.address = walletA;
  });

  it("renders timeline, role matrix and coverage without mutation controls", async () => {
    const report = completeReport();
    report.timeline = report.events;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ report }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    render(<AuthorityHistory />);
    fireEvent.change(screen.getByLabelText("Contract address"), { target: { value: contract } });
    fireEvent.submit(screen.getByRole("form", { name: /authority history scan range/i }));

    expect(screen.getByTestId("authority-loading")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("authority-coverage")).toBeTruthy());
    expect(screen.getByTestId("authority-timeline").textContent).toContain("OwnershipTransferred");
    expect(screen.getByTestId("authority-role-matrix").textContent).toContain(roleAccount);
    expect(screen.queryByRole("button", { name: /^(grant|revoke|upgrade|submit)\b/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Trace authority history/i })).toBeTruthy();
  });

  it("opens the evidence drawer from the timeline and closes with Escape", async () => {
    const report = completeReport();
    report.timeline = report.events;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ report }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    render(<AuthorityHistory />);
    fireEvent.change(screen.getByLabelText("Contract address"), { target: { value: contract } });
    fireEvent.submit(screen.getByRole("form", { name: /authority history scan range/i }));
    await waitFor(() => expect(screen.getByText("OwnershipTransferred")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /OwnershipTransferred/i }));
    const drawer = screen.getByRole("complementary", { name: "Evidence detail" });
    expect(within(drawer).getByText(/block hash/i)).toBeTruthy();
    expect(within(drawer).getByText(/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/i)).toBeTruthy();

    fireEvent.keyDown(drawer, { key: "Escape" });
    await waitFor(() => expect(screen.getByTestId("authority-evidence-empty")).toBeTruthy());
  });

  it("shows route errors and exposes no grant control", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "authority_history_unavailable", message: "Provider rate limited" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );

    render(<AuthorityHistory />);
    fireEvent.change(screen.getByLabelText("Contract address"), { target: { value: contract } });
    fireEvent.submit(screen.getByRole("form", { name: /authority history scan range/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Provider rate limited");
    expect(screen.queryByRole("button", { name: /grant|revoke/i })).toBeNull();
  });

  it("does not restore a late result after the connected wallet changes", async () => {
    let resolveRequest!: (value: Response) => void;
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const view = render(<AuthorityHistory />);
    fireEvent.change(screen.getByLabelText("Contract address"), { target: { value: contract } });
    fireEvent.submit(screen.getByRole("form", { name: /authority history scan range/i }));

    walletMock.address = walletB;
    view.rerender(<AuthorityHistory />);

    const report = completeReport();
    report.timeline = report.events;
    resolveRequest(
      new Response(JSON.stringify({ report }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByTestId("authority-coverage")).toBeNull();
  });
});
