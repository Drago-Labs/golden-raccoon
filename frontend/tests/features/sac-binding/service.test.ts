import { describe, expect, it } from "vitest";
import { verifySacBinding, type ContractInstanceSnapshot } from "@/server/research/sac-binding";
import { depsFromInstance, USDC_ASSET } from "./fixtures";
import genuineSac from "./data/genuine-sac.json";
import lookalikeWasm from "./data/lookalike-wasm.json";
import undeployedSac from "./data/undeployed-sac.json";

describe("verifySacBinding service", () => {
  it("verifies a genuine SAC", async () => {
    const report = await verifySacBinding(
      { asset: USDC_ASSET, network: "stellar-testnet" },
      depsFromInstance(genuineSac as unknown as ContractInstanceSnapshot),
    );
    expect(report.classification.verdict).toBe("genuine_sac");
    expect(report.classification.isGenuineSac).toBe(true);
    expect(report.metadataComparison?.allMatch).toBe(true);
  });

  it("reports a Wasm contract with copied metadata as not a SAC", async () => {
    const report = await verifySacBinding(
      {
        asset: USDC_ASSET,
        contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
        network: "stellar-testnet",
      },
      depsFromInstance(lookalikeWasm as unknown as ContractInstanceSnapshot),
    );
    expect(report.classification.verdict).toBe("lookalike_wasm");
    expect(report.classification.isGenuineSac).toBe(false);
  });

  it("reports an undeployed SAC as derivable but not deployed", async () => {
    const report = await verifySacBinding(
      { asset: USDC_ASSET, network: "stellar-testnet" },
      depsFromInstance(undeployedSac as unknown as ContractInstanceSnapshot),
    );
    expect(report.state).toBe("partial");
    expect(report.classification.verdict).toBe("undeployed_sac");
    expect(report.derivedContractId).toMatch(/^C[A-Z2-7]{55}$/);
  });
});
