import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import {
  createDefaultSettingsReader,
  inspectNetworkSettings,
  NETWORK_SETTINGS_LIMITS,
  NetworkSettingsError,
  parseNetworkId,
} from "@/server/research/network-settings";

/**
 * Read-only Soroban network configuration for one network.
 * Testnet, futurenet, and mainnet are never combined in one response.
 */
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" } as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, {
    namespace: "network-settings",
    limit: 30,
    windowMs: 60_000,
  });

  if (rateLimited) return rateLimited;

  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > NETWORK_SETTINGS_LIMITS.maxRequestBytes) {
    return json({ error: "payload_too_large" }, 413);
  }

  let text: string;

  try {
    text = await request.text();
  } catch {
    return json({ error: "invalid_json", message: "The request body could not be read." }, 400);
  }

  if (text.length > NETWORK_SETTINGS_LIMITS.maxRequestBytes) {
    return json({ error: "payload_too_large" }, 413);
  }

  let body: unknown;

  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "invalid_json", message: "The request body is not JSON." }, 400);
  }

  const networkValue = (body as { network?: unknown } | null)?.network;

  let network;

  try {
    network = parseNetworkId(networkValue);
  } catch (error) {
    if (error instanceof NetworkSettingsError) {
      return json({ error: error.code, message: error.message }, 400);
    }

    throw error;
  }

  try {
    const report = await inspectNetworkSettings(body, { reader: createDefaultSettingsReader(network) });
    const status = report.state === "unavailable" ? 503 : 200;

    return json({ report }, status);
  } catch (error) {
    if (error instanceof NetworkSettingsError) {
      const status = error.code === "payload_too_large" ? 413 : 400;

      return json({ error: error.code, message: error.message, details: error.details }, status);
    }

    return json({ error: "network_settings_failed" }, 500);
  }
}
