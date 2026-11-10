import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SacVerifier } from "@/components/research/sac-binding/SacVerifier";
import { verifySacBinding, type ContractInstanceSnapshot } from "@/server/research/sac-binding";
import { depsFromInstance, USDC_ASSET } from "./fixtures";
import genuineSac from "./data/genuine-sac.json";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SacVerifier", () => {
  it("renders derivation steps, instance evidence, metadata comparison, and coverage notice", async () => {
    const sampleReport = await verifySacBinding(
      { asset: USDC_ASSET, network: "stellar-testnet" },
      depsFromInstance(genuineSac as unknown as ContractInstanceSnapshot),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ report: sampleReport }),
      })),
    );

    render(<SacVerifier />);
    fireEvent.click(screen.getByRole("button", { name: "Verify SAC binding" }));

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "SAC verification results" })).toBeTruthy();
    });
    expect(screen.getByTestId("instance-evidence").textContent).toMatch(/genuine_sac/);
    expect(screen.getByText("Deterministic SAC ID derivation")).toBeTruthy();
    expect(screen.getByText("Token metadata comparison")).toBeTruthy();
  });
});
