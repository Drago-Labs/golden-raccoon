import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { runOnchainAgent } from "@/server/agents/onchain";
import { checkRateLimit } from "@/server/security/rateLimit";
import { chainIdSchema, validateContractAddressForChain } from "@/server/security/inputValidation";
import { commonErrorCodes, jsonError } from "@/server/api/errors";

const bodySchema = z.object({
  chain: chainIdSchema,
  contractAddress: z.string().max(128).optional(),
  symbol: z.string().max(32).optional(),
  issuer: z.string().max(64).optional(),
  assetKey: z.string().max(180).optional(),
  assetType: z.enum(["native", "classic", "sac", "sep41", "issuer_account"]).optional(),
}).superRefine((value, context) => {
  if (value.contractAddress && !validateContractAddressForChain(value.contractAddress, value.chain)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["contractAddress"], message: "Asset address does not match the selected chain" });
  }
});

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "agent:onchain", limit: 20, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    // The `error` field is kept for existing clients; `code`/`message`/`retryable`/
    // `requestId` are the stable fields new clients should read.
    return jsonError(
      { code: commonErrorCodes.validationError, message: "Request validation failed.", status: 400, details: parsed.error.flatten() },
      { legacy: { error: parsed.error.flatten() } },
    );
  }

  return withCacheHeaders(NextResponse.json(await runOnchainAgent(parsed.data)), "onchain");
}
