import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceBytecodeWorkspace } from "@/components/research/source-bytecode/SourceBytecodeWorkspace";

describe("source bytecode workspace", () => {
  it("exposes a labelled address field and a coverage idle state", () => {
    render(<SourceBytecodeWorkspace />);
    expect(screen.getByLabelText("Contract address")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Compare bytecode" })).toBeTruthy();
    expect(screen.getByTestId("source-bytecode-idle").textContent).toMatch(/partial match/i);
  });
});
