import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TreasuryTracker } from "@/components/research/treasury-flows/TreasuryTracker";
import { analyseTreasury } from "@/server/research/treasury-flows";
import { loadFixture } from "./fixtures";
describe("the treasury view cites the reported source", () => {
  it("shows the mismatch and the blog source in text", () => {
    render(<TreasuryTracker projects={["active-treasury"]} initial={analyseTreasury(loadFixture("reported-mismatch.json"))} />);
    expect(screen.getByText(/observed 80/).textContent).toMatch(/https:\/\/project.example\/blog/);
    expect(screen.getByText(/USDC on stellar at 2: 80/).textContent).toMatch(/80/);
  });
});
