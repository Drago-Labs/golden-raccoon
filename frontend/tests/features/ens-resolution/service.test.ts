import { describe, expect, it } from "vitest";
import { verifyEnsResolution } from "@/server/research/ens-resolution";
import { recordedEnsReader, wallet } from "./fixtures";
import verified from "./data/verified-pair.json";
import mismatched from "./data/mismatched-reverse.json";

const baseRequest = {
  walletAddress: wallet,
  network: "ethereum",
  walletNetwork: "ethereum",
  ensName: "alice.eth",
};

describe("verifyEnsResolution", () => {
  it("returns verified when forward and reverse records match", async () => {
    const res = await verifyEnsResolution(baseRequest, {
      reader: recordedEnsReader(verified),
    });
    expect(res.classification).toBe("verified");
  });

  it("never reports a mismatched reverse record as verified", async () => {
    const res = await verifyEnsResolution(baseRequest, {
      reader: recordedEnsReader(mismatched),
    });
    expect(res.classification).toBe("mismatched");
  });
});
