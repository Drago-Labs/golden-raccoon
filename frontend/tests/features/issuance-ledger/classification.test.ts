import { describe, expect, it } from "vitest";
import { validateAssetIdentity } from "@/server/research/issuance-ledger/assetIdentity";
import { classifyOperation } from "@/server/research/issuance-ledger/classification";
import { burnHeavyFixture, reconciledFixture, unreconciledFixture } from "./fixtures";

const asset = validateAssetIdentity(reconciledFixture.asset_code, reconciledFixture.issuer);

describe("issuance classification", () => {
  it("classifies payments and path payments as mint or burn", () => {
    const mint = classifyOperation(reconciledFixture.operations[0]!, asset);
    const pathMint = classifyOperation(reconciledFixture.operations[1]!, asset);
    const burn = classifyOperation(reconciledFixture.operations[2]!, asset);
    expect(mint).toMatchObject({ kind: "mint", deltaStroops: 100_000_000n });
    expect(pathMint).toMatchObject({ kind: "mint", deltaStroops: 50_000_000n });
    expect(burn).toMatchObject({ kind: "burn", deltaStroops: -30_000_000n });
  });

  it("classifies claimable-balance creation as mint and clawbacks as burn", () => {
    const claimAsset = validateAssetIdentity(unreconciledFixture.asset_code, unreconciledFixture.issuer);
    const claimable = classifyOperation(unreconciledFixture.operations[1]!, claimAsset);
    const clawback = classifyOperation(unreconciledFixture.operations[2]!, claimAsset);
    expect(claimable).toMatchObject({ kind: "mint", deltaStroops: 10_000_000n });
    expect(clawback).toMatchObject({ kind: "burn", deltaStroops: -10_000_000n });

    const burnAsset = validateAssetIdentity(burnHeavyFixture.asset_code, burnHeavyFixture.issuer);
    const claimableClawback = classifyOperation(burnHeavyFixture.operations[2]!, burnAsset);
    expect(claimableClawback).toMatchObject({ kind: "burn", deltaStroops: -40_000_000n });
  });

  it("marks unrelated issuer operations as neutral", () => {
    const neutral = classifyOperation(reconciledFixture.operations[3]!, asset);
    expect(neutral).toMatchObject({ kind: "neutral", deltaStroops: 0n });
  });
});
