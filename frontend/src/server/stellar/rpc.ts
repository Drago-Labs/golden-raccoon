import type { rpc } from "@stellar/stellar-sdk";
import { withRpcSpan } from "@/server/observability/tracing/spans";
import { withStellarRpcFallback as baseWithStellarRpcFallback } from "@/server/stellar/client";

export async function withStellarRpcFallback<T>(
  value: string | undefined,
  operation: (server: rpc.Server, providerUrl: string) => Promise<T>,
) {
  return withRpcSpan("stellar_rpc", value, () => baseWithStellarRpcFallback(value, operation));
}
