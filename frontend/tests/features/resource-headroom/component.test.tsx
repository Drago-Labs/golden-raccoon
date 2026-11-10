import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResourceHeadroomWorkbench } from "@/components/research/resource-headroom/ResourceHeadroomWorkbench";
import { compareResourceHeadroom, type RawInvocationSample } from "@/server/research/resource-headroom";
import { CONTRACT_ID, depsFromSample } from "./fixtures";
import nearLimitInvocation from "./data/near-limit-invocation.json";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ResourceHeadroomWorkbench", () => {
  it("renders resource gauges, limit table, headroom warnings, and coverage notice", async () => {
    const sampleReport = await compareResourceHeadroom(
      {
        mode: "simulation",
        contractId: CONTRACT_ID,
        functionName: "swap",
        args: [],
        warningThresholdPct: 80,
        network: "stellar-testnet",
      },
      depsFromSample(nearLimitInvocation as unknown as RawInvocationSample),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ report: sampleReport }),
      })),
    );

    render(<ResourceHeadroomWorkbench />);
    fireEvent.click(screen.getByRole("button", { name: "Compare resource headroom" }));

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Resource headroom results" })).toBeTruthy();
    });
    expect(screen.getByTestId("headroom-warnings").textContent).toMatch(/92.00%/);
    expect(screen.getAllByText("CPU Instructions").length).toBeGreaterThan(0);
  });
});
