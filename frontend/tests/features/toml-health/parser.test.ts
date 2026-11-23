import { describe, it, expect } from "vitest";
import { parseStellarToml } from "@/server/research/toml-health/tomlParser";

describe("parseStellarToml", () => {
  it("parses valid TOML", () => {
    const toml = 'VERSION="2.0.0"\nSIGNING_KEY="GBQP2WXPJMQJ7L6Z5LZOMQNX46F7Q5FVLWT4FDJVVWQRFBF6GBF7XNXX"';
    const result = parseStellarToml(toml);
    expect(result.success).toBe(true);
  });
});
