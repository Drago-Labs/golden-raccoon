import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FrontendIntegrity } from "@/components/research/frontend-integrity/FrontendIntegrity";
import { analyseFrontendIntegrity } from "@/server/research/frontend-integrity";
import { loadFixture } from "./fixtures";
describe("the integrity view lists the diff in text", () => {
  it("shows two added scripts for the changed fixture", () => {
    const initial = analyseFrontendIntegrity(loadFixture("changed-scripts.json"));
    render(<FrontendIntegrity initial={initial} />);
    expect(screen.getByRole("table", { name: "Scripts" })).toBeTruthy();
    expect(screen.getByText("2 added, 1 removed, 0 header changes.").textContent).toMatch(/2 added/);
    expect(screen.getByRole("status").textContent).toMatch(/not downloaded|not executed/i);
  });
});
