import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WasmMetaReport } from "@/components/research/wasm-source-meta/WasmMetaReport";

describe("WasmMetaReport", () => {
  it("renders the contract input form", () => {
    render(<WasmMetaReport />);
    expect(screen.getByLabelText("Contract ID")).toBeDefined();
    expect(screen.getByLabelText("Network")).toBeDefined();
    expect(screen.getByRole("button", { name: /inspect metadata/i })).toBeDefined();
  });

  it("displays the idle guidance message", () => {
    render(<WasmMetaReport />);
    expect(screen.getByTestId("wasm-source-meta-idle")).toBeDefined();
  });

  it("defaults to testnet", () => {
    render(<WasmMetaReport />);
    const networkSelect = screen.getByLabelText("Network") as HTMLSelectElement;
    expect(networkSelect.value).toBe("stellar-testnet");
  });

  it("accepts pubnet as the initial network", () => {
    render(<WasmMetaReport initialNetwork="stellar-pubnet" />);
    const networkSelect = screen.getByLabelText("Network") as HTMLSelectElement;
    expect(networkSelect.value).toBe("stellar-pubnet");
  });
});
