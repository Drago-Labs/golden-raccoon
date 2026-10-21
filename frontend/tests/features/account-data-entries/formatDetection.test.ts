import { describe, expect, it } from "vitest";
import { detectFormat } from "@/server/research/account-data-entries/formatDetection";
import { decodeDataValue } from "@/server/research/account-data-entries/valueDecoder";
import { binaryFixture, textFixture } from "./fixtures";

function formatOf(base64: string) {
  return detectFormat(decodeDataValue(base64));
}

describe("format detection", () => {
  it("recognises text, account ids, contract ids, and URLs from the recorded entries", () => {
    expect(formatOf(textFixture.account.data.config)).toBe("text");
    expect(formatOf(textFixture.account.data.issuer)).toBe("account_id");
    expect(formatOf(textFixture.account.data.contract)).toBe("contract_id");
    expect(formatOf(textFixture.account.data.site)).toBe("url");
  });

  it("classifies raw 32-byte values as hashes and other non-text as binary", () => {
    expect(formatOf(binaryFixture.account.data.pointer)).toBe("hash");
    expect(formatOf(binaryFixture.account.data.blob)).toBe("binary");
    expect(formatOf(Buffer.from("ab".repeat(32), "utf8").toString("base64"))).toBe("hash");
  });
});
