import { describe, expect, it } from "vitest";
import { inspectConfusableLabels } from "@/server/research/ens-resolution";

describe("inspectConfusableLabels", () => {
  it("flags mixed-script Cyrillic look-alike characters with exact code points", () => {
    // Cyrillic small letter a (U+0430) inside otherwise Latin label
    const res = inspectConfusableLabels("\u0430lice.eth");
    expect(res.mixedScripts).toBe(true);
    expect(res.flaggedCharacters[0]!.codePointHex).toBe("U+0430");
    expect(res.flaggedCharacters[0]!.script).toBe("Cyrillic");
  });
});
