import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SafeInspectorWorkspace } from "@/components/research/safe-inspector/SafeInspectorWorkspace";

describe("safe inspector workspace", () => {
  it("labels the address field", () => {
    render(<SafeInspectorWorkspace />);
    expect(screen.getByLabelText("Safe address")).toBeTruthy();
    expect(screen.getByTestId("safe-idle").textContent).toMatch(/threshold/i);
  });
});
