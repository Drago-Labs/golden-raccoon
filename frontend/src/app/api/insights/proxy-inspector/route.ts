import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { PROXY_LIMITS, ProxyInspectorError } from "@/server/research/proxy-inspector/schema";
import { createRpcReader } from "@/server/research/proxy-inspector/rpc";
import { inspectProxy } from "@/server/research/proxy-inspector/service";

/**
 * Read-only proxy inspection.
 *
 * The endpoint holds nothing between calls. The RPC endpoint is resolved from
 * the server's own network configuration and never from the request body, so a
 * caller cannot aim this handler at an arbitrary host. The reader handed to
 * the service exposes four read methods and no way to send a transaction.
 */
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "proxy-inspector", limit: 20, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > PROXY_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: PROXY_LIMITS.maxRequestBytes }, { status: 413 });
  }

  let body: unknown;

  try {
    const raw = await request.text();

    if (raw.length > PROXY_LIMITS.maxRequestBytes) {
      return NextResponse.json({ error: "payload_too_large", limitBytes: PROXY_LIMITS.maxRequestBytes }, { status: 413 });
    }

    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const network = typeof (body as { network?: unknown } | null)?.network === "string" ? (body as { network: string }).network : "";

  try {
    const report = await inspectProxy(body, createRpcReader(network));

    return NextResponse.json({ report }, { headers: noStore });
  } catch (error) {
    if (error instanceof ProxyInspectorError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: error.code === "unsupported_network" ? 422 : 400, headers: noStore },
      );
    }

    return NextResponse.json({ error: "proxy_inspection_failed" }, { status: 500, headers: noStore });
  }
}
