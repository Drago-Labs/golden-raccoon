import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONTRACT_ID, request } from "./fixtures";

const mocks = vi.hoisted(() => ({ inspect: vi.fn(), rate: vi.fn() }));

vi.mock("@/server/research/sep41-conformance", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/sep41-conformance")>(
    "@/server/research/sep41-conformance",
  );
  return { ...actual, inspectSep41Conformance: mocks.inspect };
});
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/sep41-conformance/route";
import { Sep41ConformanceError } from "@/server/research/sep41-conformance";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/insights/sep41-conformance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const sampleReport = {
  schemaVersion: "sep41-conformance/2026-01",
  referenceVersion: "SEP-41/2024-11",
  contractId: CONTRACT_ID,
  network: "stellar-pubnet",
  state: "complete",
  interfaceDiff: [],
  simulations: [],
  eventSamples: [],
  eventShapes: [],
  findings: [],
  coverage: {
    referenceVersion: "SEP-41/2024-11",
    reachedProvider: true,
    specAvailable: true,
    interfaceMatches: 10,
    interfaceMissing: 0,
    interfaceMismatched: 0,
    interfaceExtra: 0,
    simulationsOk: 4,
    simulationsAttempted: 4,
    eventsSampled: 0,
    eventShapeFailures: 0,
    message: "ok",
  },
  readOnly: true,
  writesState: false,
};

describe("sep41-conformance route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.inspect.mockResolvedValue(sampleReport);
  });

  it("passes the body through to the service", async () => {
    const response = await POST(makeRequest(request) as never);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.report.contractId).toBe(CONTRACT_ID);
    expect(mocks.inspect).toHaveBeenCalledWith(expect.objectContaining({ contractId: CONTRACT_ID }));
  });

  it("returns 400 for typed invalid requests", async () => {
    mocks.inspect.mockRejectedValue(new Sep41ConformanceError("invalid_contract", "bad id"));
    const response = await POST(makeRequest({ contractId: "bad" }) as never);
    expect(response.status).toBe(400);
  });

  it("returns 503 when the report is unavailable", async () => {
    mocks.inspect.mockResolvedValue({ ...sampleReport, state: "unavailable" });
    const response = await POST(makeRequest(request) as never);
    expect(response.status).toBe(503);
  });
});
