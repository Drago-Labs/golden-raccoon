import { describe, expect, it } from "vitest";
import { compareRpcConsistency, CONSISTENCY_SCHEMA_VERSION, RpcConsistencyError } from "@/server/research/rpc-consistency";
import { matched, probesFor } from "./fixtures";

describe("public entry", () => {
  it("exposes the comparison and the schema version", () => {
    expect(typeof compareRpcConsistency).toBe("function");
    expect(CONSISTENCY_SCHEMA_VERSION).toBe("rpc-consistency/2026-10");
    expect(new RpcConsistencyError("invalid_request", "no").code).toBe("invalid_request");
  });

  it("runs a recorded comparison through the public function", async () => {
    const report = await compareRpcConsistency(matched.request, probesFor(matched));

    expect(report.schemaVersion).toBe(CONSISTENCY_SCHEMA_VERSION);
    expect(report.readOnly).toBe(true);
  });
});
