import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WashVolumeWorkspace } from "@/components/research/wash-volume/WashVolumeWorkspace";

describe("wash volume workspace", () => {
  it("labels the pair field and states that results are heuristic", () => {
    render(<WashVolumeWorkspace />);
    expect(screen.getByLabelText("Pair")).toBeTruthy();
    expect(screen.getByTestId("wash-idle").textContent).toMatch(/heuristic/i);
  });
});
