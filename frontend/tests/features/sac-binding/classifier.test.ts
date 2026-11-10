import { describe, expect, it } from "vitest";
import { classifySacExecutable, type ContractInstanceSnapshot } from "@/server/research/sac-binding";
import genuineSac from "./data/genuine-sac.json";
import lookalikeWasm from "./data/lookalike-wasm.json";
import undeployedSac from "./data/undeployed-sac.json";

describe("classifySacExecutable", () => {
  it("recognizes genuine SAC executable", () => {
    const instance = genuineSac as unknown as ContractInstanceSnapshot;
    const res = classifySacExecutable({
      derivedContractId: instance.contractId,
      suppliedContractId: instance.contractId,
      instance,
    });
    expect(res.verdict).toBe("genuine_sac");
    expect(res.isGenuineSac).toBe(true);
  });

  it("flags Wasm contract with copied metadata as lookalike_wasm (not a SAC)", () => {
    const instance = lookalikeWasm as unknown as ContractInstanceSnapshot;
    const res = classifySacExecutable({
      derivedContractId: instance.contractId,
      suppliedContractId: instance.contractId,
      instance,
    });
    expect(res.verdict).toBe("lookalike_wasm");
    expect(res.isGenuineSac).toBe(false);
  });

  it("reports undeployed SAC as derivable but not deployed", () => {
    const instance = undeployedSac as unknown as ContractInstanceSnapshot;
    const res = classifySacExecutable({
      derivedContractId: instance.contractId,
      suppliedContractId: null,
      instance,
    });
    expect(res.verdict).toBe("undeployed_sac");
    expect(res.deployed).toBe(false);
  });
});
