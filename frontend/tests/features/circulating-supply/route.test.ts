import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: () => null }));
const { POST } = await import("@/app/api/insights/circulating-supply/route");
describe("circulating supply route", () => { it("validates malformed requests", async () => { const response = await POST(new NextRequest("http://localhost/api/insights/circulating-supply", { method: "POST", body: JSON.stringify({}) })); expect(response.status).toBe(400); expect((await response.json()).error).toBe("invalid_request"); }); });
