import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InvocationProfile } from "@/components/research/invocation-profile/InvocationProfile";

describe("InvocationProfile", () => {
  it("renders the initial form", () => {
    render(<InvocationProfile />);
    expect(screen.getByLabelText("Contract ID")).toBeDefined();
    expect(screen.getByLabelText("Network")).toBeDefined();
    expect(screen.getByRole("button", { name: /profile invocations/i })).toBeDefined();
  });

  it("displays the idle notice", () => {
    render(<InvocationProfile />);
    expect(screen.getByTestId("invocation-profile-idle")).toBeDefined();
  });

  it("defaults to testnet", () => {
    render(<InvocationProfile />);
    const networkSelect = screen.getByLabelText("Network") as HTMLSelectElement;
    expect(networkSelect.value).toBe("stellar-testnet");
  });

  it("accepts pubnet as the initial network", () => {
    render(<InvocationProfile initialNetwork="stellar-pubnet" />);
    const networkSelect = screen.getByLabelText("Network") as HTMLSelectElement;
    expect(networkSelect.value).toBe("stellar-pubnet");
  });
});
