import { z } from "zod";

const evmAddressPattern = /^0x[a-fA-F0-9]{40}$/;
const safeChainPattern = /^[a-zA-Z0-9:_-]{1,40}$/;
const safeSymbolPattern = /^[a-zA-Z0-9$._-]{1,32}$/;
const safeSocialHandlePattern = /^@?[a-zA-Z0-9_]{2,30}$/;

export const walletAddressSchema = z.string().regex(evmAddressPattern, "Expected EVM wallet address").optional();
export const contractAddressSchema = z.string().regex(evmAddressPattern, "Expected EVM contract address").optional();
export const chainIdSchema = z.string().regex(safeChainPattern, "Invalid chain id").optional();
export const tokenSymbolSchema = z.string().regex(safeSymbolPattern, "Invalid token symbol").optional();
export const socialHandleSchema = z.string().regex(safeSocialHandlePattern, "Invalid social handle").optional();
export const externalUrlSchema = z.string().url().refine((value) => {
  const url = new URL(value);

  return url.protocol === "https:" || url.protocol === "http:";
}, "Expected http(s) URL").optional();

export function normalizeSymbol(value?: string) {
  return value?.trim().replace(/^\$/, "").toUpperCase();
}

export function validateEndpointInput<T>(schema: z.ZodType<T>, value: unknown) {
  return schema.safeParse(value);
}
