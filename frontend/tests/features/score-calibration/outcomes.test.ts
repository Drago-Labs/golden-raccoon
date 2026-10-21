import { describe, expect, it } from "vitest";
import { INCIDENT_LOG, PEG_REGISTRY, parseAssetKey } from "@/server/research/score-calibration/outcomeDefinitions";
import { detectDepeg, detectIncident, detectLargeDrawdown } from "@/server/research/score-calibration/outcomeDetection";
import { aggregationRecord, stubHorizonFetch } from "./fixtures";

describe("parseAssetKey", () => {
  it("parses a classic CODE:ISSUER key", () => {
    const result = parseAssetKey("USDX:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN");
    expect(result).toEqual({ kind: "classic", code: "USDX", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" });
  });

  it("parses a contract key", () => {
    expect(parseAssetKey("contract:CAAA")).toEqual({ kind: "contract", contractId: "CAAA" });
  });

  it("reports unrecognized for a malformed key", () => {
    expect(parseAssetKey("not-a-key")).toEqual({ kind: "unrecognized" });
  });
});

describe("detectLargeDrawdown", () => {
  it("reports occurred when price fell by at least the threshold", async () => {
    const records = [aggregationRecord("10", "9.8", "10", "1"), aggregationRecord("9", "4", "9", "2")];
    const fetchImpl = stubHorizonFetch(records);
    const result = await detectLargeDrawdown("USDX:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", "pubnet", 0, 1000, fetchImpl);
    expect(result).toEqual({ outcome: "occurred" });
  });

  it("reports did_not_occur when the price stayed within the threshold", async () => {
    const records = [aggregationRecord("10", "9.5", "10", "1")];
    const fetchImpl = stubHorizonFetch(records);
    const result = await detectLargeDrawdown("USDX:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", "pubnet", 0, 1000, fetchImpl);
    expect(result).toEqual({ outcome: "did_not_occur" });
  });

  it("reports unsupported for a contract asset key", async () => {
    const result = await detectLargeDrawdown("contract:CAAA", "pubnet", 0, 1000, stubHorizonFetch([]));
    expect(result).toMatchObject({ outcome: "unsupported", reason: "unsupported_asset_type" });
  });

  it("reports unsupported when Horizon has no trades for the window", async () => {
    const result = await detectLargeDrawdown("USDX:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", "pubnet", 0, 1000, stubHorizonFetch([]));
    expect(result).toMatchObject({ outcome: "unsupported", reason: "price_data_unavailable" });
  });

  it("reports unsupported when Horizon returns an error status", async () => {
    const result = await detectLargeDrawdown("USDX:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", "pubnet", 0, 1000, stubHorizonFetch([], 503));
    expect(result).toMatchObject({ outcome: "unsupported", reason: "price_data_unavailable" });
  });
});

describe("detectDepeg", () => {
  it("reports outcome_not_configured since PEG_REGISTRY is empty by default", () => {
    expect(PEG_REGISTRY).toEqual([]);
    const result = detectDepeg("USDX:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", 0, 1000);
    expect(result).toMatchObject({ outcome: "unsupported", reason: "outcome_not_configured" });
  });
});

describe("detectIncident", () => {
  it("reports outcome_not_configured since INCIDENT_LOG is empty by default", () => {
    expect(INCIDENT_LOG).toEqual([]);
    const result = detectIncident("USDX:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", 0, 1000);
    expect(result).toMatchObject({ outcome: "unsupported", reason: "outcome_not_configured" });
  });
});
