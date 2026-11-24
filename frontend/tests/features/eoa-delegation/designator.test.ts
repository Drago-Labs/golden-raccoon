import { describe, expect, it } from "vitest";
import { normalizeEoaAddress } from "@/server/research/eoa-delegation/addressInput";
import { createCodeReader } from "@/server/research/eoa-delegation/codeReader";
import { decodeDelegationDesignator, EIP7702_PREFIX } from "@/server/research/eoa-delegation/designator";
import { delegationRequestSchema } from "@/server/research/eoa-delegation/schema";
import { DESIGNATOR, TARGET } from "./fixtures";
describe("EIP-7702 designator", () => { it("decodes the exact 0xef0100 target", () => { expect(EIP7702_PREFIX).toBe("0xef0100"); expect(decodeDelegationDesignator(DESIGNATOR)?.toLowerCase()).toBe(TARGET.toLowerCase()); }); it("rejects ordinary code and invalid input", () => { expect(decodeDelegationDesignator("0x6000")).toBeNull(); expect(() => normalizeEoaAddress("bad")).toThrow(); expect(delegationRequestSchema.safeParse({ address: "bad", network: "ethereum" }).success).toBe(false); expect(typeof createCodeReader("https://rpc.example")).toBe("function"); }); });
