import { describe, expect, it } from "vitest";
import { decodeEnvelope } from "@/server/research/tx-preconditions/envelopeDecode";
import { evaluateExtraSigners } from "@/server/research/tx-preconditions/extraSigners";
import { feeBumpFixture } from "./fixtures";

describe("extraSigners", () => {
  it("lists the fee-bump inner extra signer as missing a signature", () => {
    const decoded = decodeEnvelope(feeBumpFixture.envelope_xdr, "stellar-testnet");
    const signers = evaluateExtraSigners(decoded.inner, decoded.preconditions.extraSigners);

    expect(signers).toHaveLength(1);
    expect(signers[0]?.key).toBe(feeBumpFixture.extra_signer);
    expect(signers[0]?.signaturePresent).toBe(false);
    expect(signers[0]?.canBeSatisfied).toBe(false);
    expect(signers[0]?.note).toMatch(/still needs a signature/i);
  });
});
