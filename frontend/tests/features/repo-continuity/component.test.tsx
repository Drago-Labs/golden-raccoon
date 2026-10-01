import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RepoContinuityWorkspace } from "@/components/research/repo-continuity/RepoContinuityWorkspace";

describe("repo workspace", () => {
  it("exposes a repository field", () => {
    render(<RepoContinuityWorkspace />);
    expect(screen.getByLabelText("Repository")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Measure" })).toBeTruthy();
  });
});
