import { describe, expect, it } from "vitest";
import { extractReadableText, splitParagraphs, splitSentences } from "@/server/research/policy-changes/textExtraction";
import { ORIGINAL_PAGE_HTML } from "./fixtures";

describe("extractReadableText", () => {
  it("strips tags and scripts, keeping readable prose", () => {
    const text = extractReadableText(ORIGINAL_PAGE_HTML, "text/html");
    expect(text).toContain("Withdrawal fees are 2% of the transaction amount.");
    expect(text).not.toContain("<p>");
  });

  it("removes script and style blocks entirely", () => {
    const html = "<html><body><script>alert(1)</script><style>.a{color:red}</style><p>Hello</p></body></html>";
    const text = extractReadableText(html, "text/html");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
    expect(text).toContain("Hello");
  });

  it("passes plain text through with normalized whitespace", () => {
    const text = extractReadableText("Hello   world\n\n\nagain", "text/plain");
    expect(text).toBe("Hello world\nagain");
  });
});

describe("splitParagraphs", () => {
  it("splits on normalized newlines", () => {
    expect(splitParagraphs("one\ntwo\n\nthree")).toEqual(["one", "two", "three"]);
  });
});

describe("splitSentences", () => {
  it("splits a paragraph into sentences", () => {
    const sentences = splitSentences("Fees are 2%. We may change terms at any time.");
    expect(sentences).toEqual(["Fees are 2%.", "We may change terms at any time."]);
  });
});
