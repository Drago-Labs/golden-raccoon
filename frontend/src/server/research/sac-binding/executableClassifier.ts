import type { ContractInstanceSnapshot, ExecutableClassification } from "./schema";

export function classifySacExecutable(input: {
  derivedContractId: string | null;
  suppliedContractId: string | null;
  instance: ContractInstanceSnapshot;
}): ExecutableClassification {
  const { derivedContractId, suppliedContractId, instance } = input;

  if (
    derivedContractId &&
    suppliedContractId &&
    derivedContractId !== suppliedContractId
  ) {
    if (instance.executableKind === "wasm") {
      return {
        verdict: "lookalike_wasm",
        isGenuineSac: false,
        deployed: instance.deployed,
        executableKind: "wasm",
        explanation:
          "Not a SAC: contract is a custom Wasm executable and its address does not match the deterministic SAC derivation.",
      };
    }
    return {
      verdict: "address_mismatch",
      isGenuineSac: false,
      deployed: instance.deployed,
      executableKind: instance.executableKind,
      explanation: `Supplied contract ID (${suppliedContractId}) does not match derived SAC ID (${derivedContractId}).`,
    };
  }

  if (!instance.deployed || instance.executableKind === "missing") {
    return {
      verdict: "undeployed_sac",
      isGenuineSac: false,
      deployed: false,
      executableKind: "missing",
      explanation:
        "Deterministic SAC address is valid and derivable, but the Stellar Asset Contract has not been deployed on-chain yet.",
    };
  }

  if (instance.executableKind === "wasm") {
    return {
      verdict: "lookalike_wasm",
      isGenuineSac: false,
      deployed: true,
      executableKind: "wasm",
      explanation:
        "Not a SAC: contract instance uses a Wasm bytecode executable rather than CONTRACT_EXECUTABLE_STELLAR_ASSET.",
    };
  }

  return {
    verdict: "genuine_sac",
    isGenuineSac: true,
    deployed: true,
    executableKind: "stellar_asset",
    explanation:
      "Verified genuine Stellar Asset Contract: contract ID matches deterministic derivation and executable is CONTRACT_EXECUTABLE_STELLAR_ASSET.",
  };
}
