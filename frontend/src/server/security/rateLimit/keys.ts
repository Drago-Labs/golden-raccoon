const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;

export function fingerprint(value: string): string {
  let hash = FNV_OFFSET;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * FNV_PRIME) & FNV_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

export function getClientIp(request: Request): string {
  const headers = request.headers;
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headers.get("x-real-ip")?.trim();
  const cfConnectingIp = headers.get("cf-connecting-ip")?.trim();
  return forwardedFor || realIp || cfConnectingIp || "local";
}

function readWalletSessionMaterial(request: Request): string {
  const header = request.headers.get("cookie") ?? "";
  for (const piece of header.split(";")) {
    const [rawKey, ...rest] = piece.split("=");
    if (rawKey?.trim() !== "gr_wallet_session") continue;
    const rawValue = rest.join("=").trim();
    if (!rawValue) return "anon";
    try { return decodeURIComponent(rawValue); } catch { return rawValue; }
  }
  return "anon";
}

function readNetworkMaterial(request: Request): string {
  const headerNetwork = request.headers.get("x-stellar-network") ?? request.headers.get("x-chain-network") ?? request.headers.get("x-network");
  if (headerNetwork?.trim()) return headerNetwork.trim().toLowerCase();
  try {
    const url = new URL(request.url);
    const queryNetwork = url.searchParams.get("chain") ?? url.searchParams.get("network");
    if (queryNetwork?.trim()) return queryNetwork.trim().toLowerCase();
  } catch {}
  return process.env.NEXT_PUBLIC_STELLAR_NETWORK?.trim().toLowerCase() || "default";
}

export function buildBucketKeyFromRequest(request: Request, namespace: string): string {
  const client = fingerprint(`client:${getClientIp(request)}`);
  const walletSession = fingerprint(`wallet-session:${readWalletSessionMaterial(request)}`);
  const network = fingerprint(`network:${readNetworkMaterial(request)}`);
  return `${namespace}:${client}:${walletSession}:${network}`;
}

export function bucketKeyFingerprint(bucketKey: string): string {
  return fingerprint(bucketKey);
}
