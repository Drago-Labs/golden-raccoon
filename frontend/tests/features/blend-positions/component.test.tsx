import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LendingPositionWorkbench } from "@/components/research/blend-positions/LendingPositionWorkbench";
import { explainBlendPositions } from "@/server/research/blend-positions";
import { ACCOUNT_ID, depsFromFixture, POOL_ID } from "./fixtures";
import healthyFixture from "./data/healthy-position.json";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LendingPositionWorkbench", () => {
  it("renders positions, health breakdown, liquidation scenarios, and coverage notice", async () => {
    const sampleReport = await explainBlendPositions(
      { accountId: ACCOUNT_ID, poolId: POOL_ID, network: "stellar-testnet" },
      depsFromFixture(healthyFixture),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ report: sampleReport }),
      })),
    );

    render(<LendingPositionWorkbench />);
    fireEvent.click(screen.getByRole("button", { name: "Inspect Blend position" }));

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Blend position results" })).toBeTruthy();
    });
    expect(screen.getByTestId("health-breakdown").textContent).toMatch(/healthy/);
    expect(screen.getByText("1100.0")).toBeTruthy();
    expect(screen.getByTestId("coverage-notice").textContent).toMatch(/512000/);
  });
});
