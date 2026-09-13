import { beforeEach, describe, expect, it, vi } from "vitest";
import { stellarWallet } from "./fixtures";

const mocks = vi.hoisted(() => ({ plan: vi.fn(), session: vi.fn(), authz: vi.fn(), rate: vi.fn() }));
vi.mock("@/server/research/reserve-planner", async () => ({ ...(await vi.importActual<typeof import("@/server/research/reserve-planner")>("@/server/research/reserve-planner")), buildReservePlan: mocks.plan }));
vi.mock("@/server/security/walletSession", () => ({ resolveWalletSession: mocks.session }));
vi.mock("@/server/security/authz", () => ({ evaluateCapability: mocks.authz }));
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));
import { POST } from "@/app/api/insights/reserve-planner/route";

describe("reserve planner route", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.rate.mockReturnValue(null); mocks.session.mockReturnValue({ wallet: stellarWallet }); mocks.authz.mockReturnValue({ allowed: true }); mocks.plan.mockResolvedValue({ walletAddress: stellarWallet, network: "stellar-testnet", state: "complete" }); });
  it("uses the authenticated wallet for the read", async () => {
    const response = await POST(new Request("http://localhost/api/insights/reserve-planner", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ walletAddress: stellarWallet, network: "stellar-testnet", walletNetwork: "stellar-testnet", feeAllowanceStroops: "100000", scenario: { action: "none", count: 1 } }) }));
    expect(response.status).toBe(200);
    expect(mocks.plan).toHaveBeenCalledWith(expect.objectContaining({ walletAddress: stellarWallet, feeAllowanceStroops: 100000n }));
  });
  it("does not read providers after wallet rejection", async () => {
    mocks.session.mockReturnValue({ response: new Response("forbidden", { status: 403 }) });
    const response = await POST(new Request("http://localhost/api/insights/reserve-planner", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ walletAddress: stellarWallet, network: "stellar-testnet", walletNetwork: "stellar-testnet" }) }));
    expect(response.status).toBe(403); expect(mocks.plan).not.toHaveBeenCalled();
  });
});
