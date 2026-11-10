import { beforeEach, describe, expect, it, vi } from "vitest";
import { USDC_ASSET } from "./fixtures";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), rate: vi.fn() }));

vi.mock("@/server/research/sac-binding", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/sac-binding")>(
    "@/server/research/sac-binding",
  );
  return { ...actual, verifySacBinding: mocks.verify };
});
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/sac-binding/route";

function post(body: unknown) {
  return new Request("http://localhost/api/insights/sac-binding", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/insights/sac-binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.verify.mockResolvedValue({ state: "complete" });
  });

  it("accepts asset input and returns 200", async () => {
    const res = await POST(post({ asset: USDC_ASSET, network: "stellar-testnet" }));
    expect(res.status).toBe(200);
    expect(mocks.verify).toHaveBeenCalled();
  });

  it("returns 400 when neither asset nor contractId is provided", async () => {
    const res = await POST(post({ network: "stellar-testnet" }));
    expect(res.status).toBe(400);
  });

  it("returns 503 when service state is unavailable", async () => {
    mocks.verify.mockResolvedValue({ state: "unavailable" });
    const res = await POST(post({ asset: USDC_ASSET, network: "stellar-testnet" }));
    expect(res.status).toBe(503);
  });
});
