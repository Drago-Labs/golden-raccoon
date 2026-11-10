import { describe, expect, it } from "vitest";
import { inspectMetamorphicContract, type RecordedContractEvidence } from "@/server/research/metamorphic-check";
import { contractAddress, recordedMetamorphicReader, wallet } from "./fixtures";
import metamorphic from "./data/metamorphic-factory.json";
import ordinary from "./data/ordinary-contract.json";
import missingCreation from "./data/missing-creation.json";

const baseRequest = {
  walletAddress: wallet,
  network: "ethereum",
  walletNetwork: "ethereum",
  contractAddress,
};

describe("inspectMetamorphicContract", () => {
  it("classifies a metamorphic CREATE2 + SELFDESTRUCT contract accurately", async () => {
    const res = await inspectMetamorphicContract(baseRequest, {
      reader: recordedMetamorphicReader(metamorphic as RecordedContractEvidence),
    });
    expect(res.classification).toBe("redeployable_metamorphic");
  });

  it("classifies an ordinary CREATE contract without SELFDESTRUCT as ordinary_immutable_creation", async () => {
    const res = await inspectMetamorphicContract(baseRequest, {
      reader: recordedMetamorphicReader(ordinary as RecordedContractEvidence),
    });
    expect(res.classification).toBe("ordinary_immutable_creation");
  });

  it("marks missing creation evidence as inconclusive rather than safe", async () => {
    const res = await inspectMetamorphicContract(baseRequest, {
      reader: recordedMetamorphicReader(missingCreation as RecordedContractEvidence),
    });
    expect(res.classification).toBe("inconclusive");
    expect(res.state).toBe("partial");
  });
});
