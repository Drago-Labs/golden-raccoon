import { describe, expect, it } from "vitest";
import { mapAudits, type AuditRecord } from "@/server/research/audit-coverage/service";

const record: AuditRecord = {
  id: "a1",
  auditor: "Example",
  date: "2024-01-01",
  reportUrl: "https://example.test/audit",
  reportHash: "abc",
  providedDigest: "abc",
  commit: "c1",
  codeHash: "0xhash",
  contracts: ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
  findings: [{ severity: "high", resolution: "fixed" }],
};

describe("audit coverage", () => {
  it("marks a different code hash as changed since audit", () => {
    const report = mapAudits([record], [{ address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", codeHash: "0xother" }]);
    expect(report.contracts[0].status).toBe("changed-since-audit");
  });

  it("does not show a mismatched report hash as intact", () => {
    const report = mapAudits([{ ...record, providedDigest: "nope" }], [{ address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", codeHash: "0xhash" }]);
    expect(report.records[0].intact).toBe(false);
    expect(report.contracts[0].status).toBe("unknown");
  });

  it("keeps a contract without evidence unknown", () => {
    const report = mapAudits([record], [{ address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }]);
    expect(report.contracts[0].status).toBe("unknown");
  });
});
