import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccountLineageWorkspace } from "@/components/research/account-lineage/AccountLineageWorkspace";

describe("lineage workspace", () => {
  it("exposes an account field", () => {
    render(<AccountLineageWorkspace />);
    expect(screen.getByLabelText("Stellar account")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Trace" })).toBeTruthy();
  });
});
