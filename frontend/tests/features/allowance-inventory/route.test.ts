import { beforeEach, describe, expect, it, vi } from "vitest";
import { walletA, walletB } from "./fixtures";

const mocks = vi.hoisted(() => ({ inventory: vi.fn(), session: vi.fn(), authz: vi.fn(), rate: vi.fn() }));
vi.mock("@/server/research/allowance-inventory", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/allowance-inventory")>("@/server/research/allowance-inventory");
  return { ...actual, buildAllowanceInventory: mocks.inventory };
});
vi.mock("@/server/security/walletSession", () => ({ resolveWalletSession: mocks.session }));
vi.mock("@/server/security/authz", () => ({ evaluateCapability: mocks.authz }));
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/allowance-inventory/route";

describe("allowance inventory route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.session.mockReturnValue({ wallet: walletA });
    mocks.authz.mockReturnValue({ allowed: true });
    mocks.inventory.mockResolvedValue({ walletAddress: walletA, network: "ethereum", entries: [], spenderGroups: [], state: "complete", coverage: {}, generatedAt: "now" });
  });

  it("uses the authenticated wallet as the authoritative owner", async () => {
    const request = new Request("http://localhost/api/insights/allowance-inventory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ walletAddress: walletA, network: "ethereum", fromBlock: "1", toBlock: "2", pairs: [] }) });
    expect((await POST(request)).status).toBe(200);
    expect(mocks.inventory).toHaveBeenCalledWith(expect.objectContaining({ walletAddress: walletA }));
  });

  it("returns the wallet-session rejection before any provider read", async () => {
    mocks.session.mockReturnValue({ response: new Response(JSON.stringify({ error: "wallet_mismatch" }), { status: 403 }) });
    const request = new Request("http://localhost/api/insights/allowance-inventory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ walletAddress: walletB, network: "ethereum", fromBlock: "1", toBlock: "2" }) });
    expect((await POST(request)).status).toBe(403);
    expect(mocks.inventory).not.toHaveBeenCalled();
  });
});
