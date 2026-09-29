import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveRegion } from "@/components/a11y/LiveRegion";

describe("research a11y primitives", () => {
  it("announces status updates through LiveRegion", () => {
    const { rerender } = render(<LiveRegion message="Loading research view" />);
    expect(screen.getByText("Loading research view")).toBeTruthy();
    rerender(<LiveRegion message="Coverage ready" />);
    expect(screen.getByText("Coverage ready")).toBeTruthy();
  });

  it("keeps keyboard focus on interactive toggles", () => {
    render(
      <div role="group" aria-label="Dependency view">
        <button type="button" aria-pressed="true">
          Table
        </button>
        <button type="button" aria-pressed="false">
          Diagram
        </button>
      </div>,
    );
    const diagram = screen.getByRole("button", { name: "Diagram" });
    diagram.focus();
    expect(document.activeElement).toBe(diagram);
    fireEvent.click(diagram);
    expect(diagram.getAttribute("aria-pressed")).toBe("false");
  });
});
