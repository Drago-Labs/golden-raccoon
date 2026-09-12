import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/insights/report-comparison/route";
import {
  mockBaseSnapshotDoc,
  mockTargetSnapshotDoc,
  mockCrossAssetSnapshotDoc,
  mockCrossNetworkSnapshotDoc,
  createFixtureRecord,
} from "./fixtures";
import { getSnapshotStorageAdapter } from "@/server/snapshots/store";

function createPostRequest(bodyContent: unknown): NextRequest {
  const serialized = typeof bodyContent === "string" ? bodyContent : JSON.stringify(bodyContent);
  const req = new Request("http://localhost:3000/api/insights/report-comparison", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "127.0.0.1",
    },
    body: serialized,
  });
  return req as unknown as NextRequest;
}

describe("Report Comparison API Route (POST)", () => {
  it("returns 200 with semantic comparison payload and no-store cache control", async () => {
    const request = createPostRequest({
      baseSnapshot: mockBaseSnapshotDoc,
      targetSnapshot: mockTargetSnapshotDoc,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");

    const json = await response.json();
    expect(json.schemaVersion).toBe("report-comparison/2026-01");
    expect(json.scoreDelta.buyRisk.delta).toBe(46);
    expect(json.scoreDelta.verdict.changed).toBe(true);
    expect(json.sources.summary.disappearedCount).toBe(1);
    expect(json.notices.disappearingSourcesAreNotResolvedRisks).toBe(true);
  });

  it("returns 200 when comparing snapshots referenced by identifier from store", async () => {
    const adapter = await getSnapshotStorageAdapter();
    const baseRecord = createFixtureRecord("route_snap_base_01", mockBaseSnapshotDoc);
    const targetRecord = createFixtureRecord("route_snap_target_02", mockTargetSnapshotDoc);

    await adapter.createRiskSnapshot(baseRecord);
    await adapter.createRiskSnapshot(targetRecord);

    const request = createPostRequest({
      baseId: "route_snap_base_01",
      targetId: "route_snap_target_02",
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.subject.baseObservation.id).toBe("route_snap_base_01");
    expect(json.subject.targetObservation.id).toBe("route_snap_target_02");
    expect(json.scoreDelta.buyRisk.delta).toBe(46);
  });

  it("returns 400 Bad Request on cross-asset comparison attempts", async () => {
    const request = createPostRequest({
      baseSnapshot: mockBaseSnapshotDoc,
      targetSnapshot: mockCrossAssetSnapshotDoc,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.code).toBe("cross_asset");
    expect(json.error).toContain("different canonical assets");
  });

  it("returns 400 Bad Request on cross-network comparison attempts", async () => {
    const request = createPostRequest({
      baseSnapshot: mockBaseSnapshotDoc,
      targetSnapshot: mockCrossNetworkSnapshotDoc,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.code).toBe("cross_network");
    expect(json.error).toContain("different networks");
  });

  it("returns 400 Bad Request on malformed JSON payload", async () => {
    const req = new Request("http://localhost:3000/api/insights/report-comparison", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "127.0.0.1",
      },
      body: "invalid-json-content{",
    });

    const response = await POST(req as unknown as NextRequest);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toContain("Malformed JSON payload");
  });

  it("returns 404 Not Found when a referenced snapshot id is missing", async () => {
    const request = createPostRequest({
      baseId: "snap_nonexistent_base",
      targetId: "snap_nonexistent_target",
    });

    const response = await POST(request);
    expect(response.status).toBe(404);

    const json = await response.json();
    expect(json.code).toBe("not_found");
  });

  it("returns 410 Gone when comparing a revoked snapshot identifier", async () => {
    const adapter = await getSnapshotStorageAdapter();
    const revokedRecord = createFixtureRecord("route_snap_revoked", mockBaseSnapshotDoc, {
      revokedAt: "2026-07-06T13:00:00.000Z",
    });
    await adapter.createRiskSnapshot(revokedRecord);

    const request = createPostRequest({
      baseId: "route_snap_revoked",
      targetId: "route_snap_revoked",
    });

    const response = await POST(request);
    expect(response.status).toBe(410);

    const json = await response.json();
    expect(json.code).toBe("revoked");
  });

  it("returns 410 Gone when comparing an expired snapshot identifier", async () => {
    const adapter = await getSnapshotStorageAdapter();
    const expiredRecord = createFixtureRecord("route_snap_expired", mockBaseSnapshotDoc, {
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    await adapter.createRiskSnapshot(expiredRecord);

    const request = createPostRequest({
      baseId: "route_snap_expired",
      targetId: "route_snap_expired",
    });

    const response = await POST(request);
    expect(response.status).toBe(410);

    const json = await response.json();
    expect(json.code).toBe("expired");
  });

  it("returns 422 Unprocessable Entity when a snapshot has invalid structure or content tampering", async () => {
    const request = createPostRequest({
      baseSnapshot: {
        ...mockBaseSnapshotDoc,
        schemaVersion: "unsupported_version_999",
      },
      targetSnapshot: mockTargetSnapshotDoc,
    });

    const response = await POST(request);
    expect(response.status).toBe(422);

    const json = await response.json();
    expect(json.code).toBe("invalid_snapshot");
  });
});
