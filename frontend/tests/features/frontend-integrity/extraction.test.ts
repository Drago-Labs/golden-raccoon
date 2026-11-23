import { describe, expect, it } from "vitest";
import { sha256Text } from "@/server/research/frontend-integrity/hashing";
import { fetchRecordedPage } from "@/server/research/frontend-integrity/pageFetch";
import { extractScripts } from "@/server/research/frontend-integrity/scriptExtraction";

describe("script extraction records source text and does not run it", () => {
  it("leaves a payload script unexecuted and hashes the inline source", () => {
    const page = fetchRecordedPage('<script>globalThis.__pwned = true</script>', {});
    const [script] = extractScripts(page.html, "https://app.example");
    expect(script.executed).toBe(false);
    expect(script.inline).toBe(true);
    expect(script.sha256).toBe(sha256Text("globalThis.__pwned = true"));
    expect((globalThis as { __pwned?: boolean }).__pwned).toBeUndefined();
  });
});
