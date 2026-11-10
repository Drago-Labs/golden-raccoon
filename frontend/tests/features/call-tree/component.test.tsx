import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CallTreeWorkbench } from "@/components/research/call-tree/CallTreeWorkbench";
import { traceCallTree, type RawInvocationMeta } from "@/server/research/call-tree";
import { depsFromMeta, TX_HASH } from "./fixtures";
import nestedCall from "./data/nested-call.json";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CallTreeWorkbench", () => {
  it("renders collapsible call tree, node detail, and net transfer summary", async () => {
    const sampleReport = await traceCallTree(
      { txHash: TX_HASH, network: "stellar-testnet" },
      depsFromMeta(nestedCall as unknown as RawInvocationMeta),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ report: sampleReport }),
      })),
    );

    render(<CallTreeWorkbench />);
    fireEvent.click(screen.getByRole("button", { name: "Trace call tree" }));

    await waitFor(() => {
      expect(screen.getByRole("tree", { name: "Contract call hierarchy" })).toBeTruthy();
    });
    expect(screen.getAllByText("swap_exact_tokens").length).toBeGreaterThan(0);
    expect(screen.getByText("transfer")).toBeTruthy();
    expect(screen.getByText("-50000000")).toBeTruthy();
  });
});
