import { describe, expect, it, vi } from "vitest";
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: () => null }));
vi.mock("@/server/research/eoa-delegation", async (original) => { const actual = await original<typeof import("@/server/research/eoa-delegation")>(); return { ...actual, inspectEoaDelegation: vi.fn(async (input) => ({ address: input.address, network: input.network, state: "plain", target: null, implementation: null, verifiedSource: null, capabilities: [], history: [], coverage: [] })) }; });
import { POST } from "@/app/api/insights/eoa-delegation/route";
import { request } from "./fixtures";
describe("delegation route", () => { it("validates and returns a no-store report", async () => { const response = await POST(new Request("http://local/api", { method: "POST", body: JSON.stringify(request) })); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store"); }); it("rejects invalid input", async () => { expect((await POST(new Request("http://local/api", { method: "POST", body: "{}" }))).status).toBe(400); }); });
