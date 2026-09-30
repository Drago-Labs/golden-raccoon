import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VenueTimelineWorkspace } from "@/components/research/venue-timeline/VenueTimelineWorkspace";

describe("venue timeline workspace", () => {
  it("labels the contract field and treats missing data as unknown", () => {
    render(<VenueTimelineWorkspace />);
    expect(screen.getByLabelText("Token contract")).toBeTruthy();
    expect(screen.getByTestId("venue-idle").textContent).toMatch(/unknown/i);
  });
});
