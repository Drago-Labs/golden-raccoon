import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PositionExplainer } from "@/components/research/clmm-positions/PositionExplainer";

describe("PositionExplainer", () => {
  it("renders accessible address input and explain action", () => {
    render(<PositionExplainer />);
    expect(screen.getByLabelText(/Account address/i)).toBeTruthy();
    expect(screen.getByLabelText(/Network/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Explain positions/i })).toBeTruthy();
    expect(screen.getByTestId("clmm-positions-idle")).toBeTruthy();
  });

  it("defaults to ethereum", () => {
    render(<PositionExplainer />);
    expect((screen.getByLabelText(/Network/i) as HTMLSelectElement).value).toBe("ethereum");
  });

  it("accepts an initial network", () => {
    render(<PositionExplainer initialNetwork="base" />);
    expect((screen.getByLabelText(/Network/i) as HTMLSelectElement).value).toBe("base");
  });
});
