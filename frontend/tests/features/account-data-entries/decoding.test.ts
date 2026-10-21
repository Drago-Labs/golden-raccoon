import { describe, expect, it } from "vitest";
import { decodeDataValue } from "@/server/research/account-data-entries/valueDecoder";
import { binaryFixture, textFixture } from "./fixtures";

describe("data value decoding", () => {
  it("decodes printable UTF-8 and keeps the hex", () => {
    const decoded = decodeDataValue(textFixture.account.data.config);
    expect(decoded.utf8).toBe("hello");
    expect(decoded.text).toBe(true);
    expect(decoded.hex).toBe(Buffer.from("hello").toString("hex"));
  });

  it("does not turn binary bytes into text", () => {
    const pointer = decodeDataValue(binaryFixture.account.data.pointer);
    const blob = decodeDataValue(binaryFixture.account.data.blob);

    expect(pointer.utf8).toBeNull();
    expect(pointer.text).toBe(false);
    expect(pointer.byteLength).toBe(32);
    expect(pointer.hex).toBe("ab".repeat(32));
    expect(blob.utf8).toBeNull();
    expect(blob.hex).toBe("ff00fe");
    expect(JSON.stringify(pointer)).not.toContain("\\uFFFD");
  });
});
