import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PoolReturnsReport } from "@/components/research/pool-share-returns/PoolReturnsReport";

describe("PoolReturnsReport", () => {
  it("renders initial form", () => {
    render(<PoolReturnsReport />);
    expect(screen.getByLabelText("Account")).toBeDefined();
    expect(screen.getByLabelText("Pool ID")).toBeDefined();
    expect(screen.getByRole("button", { name: /calculate/i })).toBeDefined();
  });

  it("displays idle message", () => {
    render(<PoolReturnsReport />);
    expect(screen.getByTestId("pool-returns-idle")).toBeDefined();
  });

  it("renders with testnet by default", () => {
    render(<PoolReturnsReport />);
    const networkSelect = screen.getByLabelText("Network") as HTMLSelectElement;
    expect(networkSelect.value).toBe("stellar-testnet");
  });

  it("renders with pubnet when specified", () => {
    render(<PoolReturnsReport initialNetwork="stellar-pubnet" />);
    const networkSelect = screen.getByLabelText("Network") as HTMLSelectElement;
    expect(networkSelect.value).toBe("stellar-pubnet");
  });
});
