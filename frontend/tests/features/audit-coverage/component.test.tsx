import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuditCoverageWorkspace } from "@/components/research/audit-coverage/AuditCoverageWorkspace";

describe("audit workspace", () => {
  it("exposes a contract field", () => {
    render(<AuditCoverageWorkspace />);
    expect(screen.getByLabelText("Contract address")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Match audits" })).toBeTruthy();
  });
});
