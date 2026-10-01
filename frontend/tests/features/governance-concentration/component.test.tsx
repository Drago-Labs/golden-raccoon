import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GovernanceWorkspace } from "@/components/research/governance-concentration/GovernanceWorkspace";

describe("governance workspace", () => {
  it("exposes a labeled governor field", () => {
    render(<GovernanceWorkspace />);
    expect(screen.getByLabelText("Governor address")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Summarize" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Proposal list" })).toBeTruthy();
  });
});
