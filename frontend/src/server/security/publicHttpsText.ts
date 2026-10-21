import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";

const blockedIpv4 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedIpv4.addSubnet(address, prefix, "ipv4");
}

export function isPublicIpv4(address: string): boolean {
  return isIP(address) === 4 && !blockedIpv4.check(address, "ipv4");
}

export function parsePublicHttpsUrl(value: string): URL {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" || url.username || url.password || url.hash || url.port ||
    isIP(hostname.replace(/^\[|\]$/g, "")) !== 0 ||
    !hostname.includes(".") || hostname.endsWith(".") ||
    /\.(?:local|localhost|internal|test|invalid)$/i.test(hostname)
  ) {
    throw new Error("External HTTPS domain required");
  }
  return url;
}

async function resolvePublicAddress(hostname: string): Promise<string> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  const ipv4 = addresses.filter((entry) => entry.family === 4);
  // Fail closed on mixed public/private answers; IPv6-only hosts are unsupported.
  if (ipv4.length === 0 || ipv4.some((entry) => !isPublicIpv4(entry.address))) {
    throw new Error("Domain has no exclusively public IPv4 addresses");
  }
  return ipv4[0].address;
}

type OneResponse = { status: number; location: string | null; body: string };

function requestPinnedText(url: URL, address: string, maxBytes: number, timeoutMs: number): Promise<OneResponse> {
  return new Promise((resolve, reject) => {
    const req = request(url, {
      agent: false,
      lookup: (_hostname, _options, callback) => callback(null, address, 4),
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json, text/plain, text/toml, application/toml" },
    }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location ?? null;
      if (status >= 300 && status < 400) {
        response.destroy();
        resolve({ status, location, body: "" });
        return;
      }

      const declared = Number(response.headers["content-length"] ?? 0);
      if (Number.isFinite(declared) && declared > maxBytes) {
        response.destroy();
        reject(new Error("Response exceeds byte limit"));
        return;
      }

      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          response.destroy();
          reject(new Error("Response exceeds byte limit"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({ status, location, body: Buffer.concat(chunks).toString("utf8") }));
      response.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

/** Fetch untrusted TOML without allowing redirects or DNS changes to reach private networks. */
export async function readPublicHttpsText(value: string, maxBytes: number, timeoutMs: number): Promise<string> {
  let url = parsePublicHttpsUrl(value);
  for (let hop = 0; hop <= 3; hop++) {
    const address = await resolvePublicAddress(url.hostname);
    const response = await requestPinnedText(url, address, maxBytes, timeoutMs);
    if (response.status >= 300 && response.status < 400) {
      if (!response.location || hop === 3) throw new Error("Redirect limit exceeded");
      url = parsePublicHttpsUrl(new URL(response.location, url).toString());
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
    return response.body;
  }
  throw new Error("Redirect limit exceeded");
}
