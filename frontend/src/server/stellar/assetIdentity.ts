import { lookup } from "node:dns/promises";
import { Asset, StrKey } from "@stellar/stellar-sdk";
import { getStellarNetwork } from "@/lib/stellar/config";
import { assertSep1FetchAllowed, isPrivateOrLocalHost } from "@/server/security/urlSafety";

export type StellarAssetIdentityType =
  | "native"
  | "classic"
  | "deterministic_sac"
  | "sep41_token"
  | "issuer_account"
  | "unsupported_contract"
  | "contract";

export type StellarAssetIdentity =
  | {
      type: "native";
      assetKey: "native";
      symbol: "XLM";
      name: "Stellar Lumens";
      contractId: string;
      source?: string;
    }
  | {
      type: "classic";
      assetKey: string;
      symbol: string;
      issuer: string;
      contractId: string;
      homeDomain?: string;
      source?: string;
    }
  | {
      type: "deterministic_sac";
      assetKey: string;
      contractId: string;
      underlyingType: "native" | "classic";
      symbol: string;
      issuer?: string;
      source?: string;
    }
  | {
      type: "sep41_token";
      assetKey: string;
      contractId: string;
      symbol: string;
      name?: string;
      decimals?: number;
      wasmHash?: string;
      source?: string;
    }
  | {
      type: "issuer_account";
      assetKey: string;
      issuer: string;
      homeDomain?: string;
      source?: string;
    }
  | {
      type: "unsupported_contract";
      assetKey: string;
      contractId: string;
      reason: string;
      source?: string;
    }
  | {
      type: "contract";
      assetKey: string;
      contractId: string;
      source?: string;
    };

const assetCodePattern = /^[a-zA-Z0-9]{1,12}$/;

export function canonicalClassicAssetKey(code: string, issuer: string) {
  return `classic:${code.trim().toUpperCase()}:${issuer.trim().toUpperCase()}`;
}

export function canonicalContractAssetKey(contractId: string) {
  return `contract:${contractId.trim().toUpperCase()}`;
}

export function deriveStellarSacContractId(
  asset: { code: string; issuer?: string } | "native",
  networkPassphrase: string
): string {
  if (asset === "native" || asset.code.toUpperCase() === "XLM") {
    return Asset.native().contractId(networkPassphrase);
  }
  return new Asset(asset.code.toUpperCase(), asset.issuer!).contractId(networkPassphrase);
}

function parseStellarExplorerUrl(query: string): {
  code?: string;
  issuer?: string;
  contractId?: string;
  accountId?: string;
} | null {
  try {
    const url = new URL(query);
    const host = url.hostname.toLowerCase();
    const path = url.pathname;

    if (host.includes("stellar.expert") || host.includes("lumenscan.io") || host.includes("stellar.org")) {
      const assetMatch = path.match(/\/(?:asset|assets)\/([a-zA-Z0-9]{1,12})-([G][A-Z0-9]{55})/i);
      if (assetMatch) {
        return { code: assetMatch[1].toUpperCase(), issuer: assetMatch[2].toUpperCase() };
      }
      const contractMatch = path.match(/\/contract\/([C][A-Z0-9]{55})/i);
      if (contractMatch) {
        return { contractId: contractMatch[1].toUpperCase() };
      }
      const accountMatch = path.match(/\/(?:account|accounts)\/([G][A-Z0-9]{55})/i);
      if (accountMatch) {
        return { accountId: accountMatch[1].toUpperCase() };
      }
    }

    if (host.includes("dexscreener.com") && path.includes("/stellar/")) {
      const segs = path.split("/").filter(Boolean);
      const addr = segs[segs.length - 1]?.toUpperCase();
      if (addr && StrKey.isValidContract(addr)) {
        return { contractId: addr };
      }
      if (addr && StrKey.isValidEd25519PublicKey(addr)) {
        return { accountId: addr };
      }
      if (addr && addr.includes("-")) {
        const [code, issuer] = addr.split("-");
        if (code && issuer && StrKey.isValidEd25519PublicKey(issuer)) {
          return { code: code.toUpperCase(), issuer: issuer.toUpperCase() };
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function parseStellarAssetInput(query: string, networkId: string): StellarAssetIdentity | null {
  const network = getStellarNetwork(networkId);
  if (!network) throw new Error(`Unsupported Stellar network: ${networkId}`);
  const trimmed = query.trim();

  if (["xlm", "native", "stellar:xlm"].includes(trimmed.toLowerCase())) {
    return {
      type: "native",
      assetKey: "native",
      symbol: "XLM",
      name: "Stellar Lumens",
      contractId: Asset.native().contractId(network.networkPassphrase),
      source: "native",
    };
  }

  const explorerParsed = parseStellarExplorerUrl(trimmed);
  if (explorerParsed) {
    if (explorerParsed.code && explorerParsed.issuer) {
      const asset = new Asset(explorerParsed.code, explorerParsed.issuer);
      return {
        type: "classic",
        assetKey: canonicalClassicAssetKey(explorerParsed.code, explorerParsed.issuer),
        symbol: explorerParsed.code,
        issuer: explorerParsed.issuer,
        contractId: asset.contractId(network.networkPassphrase),
        source: "explorer_url",
      };
    }
    if (explorerParsed.contractId) {
      return {
        type: "contract",
        assetKey: canonicalContractAssetKey(explorerParsed.contractId),
        contractId: explorerParsed.contractId,
        source: "explorer_url",
      };
    }
    if (explorerParsed.accountId) {
      return {
        type: "issuer_account",
        assetKey: `issuer:${explorerParsed.accountId}`,
        issuer: explorerParsed.accountId,
        source: "explorer_url",
      };
    }
  }

  if (StrKey.isValidContract(trimmed)) {
    const contractId = trimmed.toUpperCase();
    const nativeSacId = Asset.native().contractId(network.networkPassphrase);
    if (contractId === nativeSacId) {
      return {
        type: "deterministic_sac",
        assetKey: canonicalContractAssetKey(contractId),
        contractId,
        underlyingType: "native",
        symbol: "XLM",
        source: "contract_address",
      };
    }

    return {
      type: "contract",
      assetKey: canonicalContractAssetKey(contractId),
      contractId,
      source: "contract_address",
    };
  }

  if (StrKey.isValidEd25519PublicKey(trimmed)) {
    const issuer = trimmed.toUpperCase();

    return {
      type: "issuer_account",
      assetKey: `issuer:${issuer}`,
      issuer,
      source: "account_address",
    };
  }

  const separator = trimmed.indexOf(":");

  if (separator <= 0) return null;

  const code = trimmed.slice(0, separator).toUpperCase();
  const issuer = trimmed.slice(separator + 1).toUpperCase();

  if (!assetCodePattern.test(code) || !StrKey.isValidEd25519PublicKey(issuer)) return null;

  const asset = new Asset(code, issuer);

  return {
    type: "classic",
    assetKey: canonicalClassicAssetKey(code, issuer),
    symbol: code,
    issuer,
    contractId: asset.contractId(network.networkPassphrase),
    source: "classic_identifier",
  };
}

export type Sep1TomlData = {
  documentation?: {
    orgName?: string;
    orgUrl?: string;
    orgTwitter?: string;
    orgTelegram?: string;
    orgGithub?: string;
    orgOfficialEmail?: string;
  };
  currencies?: Array<{
    code?: string;
    issuer?: string;
    contract?: string;
    name?: string;
    desc?: string;
    host?: string;
    image?: string;
    status?: string;
    displayDecimals?: number;
  }>;
};

export function parseSep1Toml(content: string): Sep1TomlData {
  const lines = content.split(/\r?\n/);
  const doc: Record<string, string> = {};
  const currencies: Array<Record<string, unknown>> = [];
  let currentSection = "";
  let currentCurrency: Record<string, unknown> | null = null;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("[[CURRENCIES]]") || line.startsWith("[[currencies]]")) {
      currentSection = "currencies";
      currentCurrency = {};
      currencies.push(currentCurrency);
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      currentSection = line.slice(1, -1).trim().toUpperCase();
      continue;
    }

    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    let val = line.slice(eqIndex + 1).trim();

    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    if (currentSection === "DOCUMENTATION") {
      const lowerKey = key.toUpperCase();
      if (lowerKey === "ORG_NAME") doc.orgName = val;
      if (lowerKey === "ORG_URL") doc.orgUrl = val;
      if (lowerKey === "ORG_TWITTER") doc.orgTwitter = val;
      if (lowerKey === "ORG_TELEGRAM") doc.orgTelegram = val;
      if (lowerKey === "ORG_GITHUB") doc.orgGithub = val;
      if (lowerKey === "ORG_OFFICIAL_EMAIL") doc.orgOfficialEmail = val;
    } else if (currentSection === "currencies" && currentCurrency) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === "display_decimals") {
        currentCurrency.displayDecimals = Number(val);
      } else {
        currentCurrency[lowerKey] = val;
      }
    }
  }

  return {
    documentation: Object.keys(doc).length > 0 ? doc : undefined,
    currencies: currencies.length > 0 ? (currencies as Sep1TomlData["currencies"]) : undefined,
  };
}

export type Sep1MetadataResult = {
  fetched: boolean;
  homeDomain?: string;
  url?: string;
  documentation?: Sep1TomlData["documentation"];
  currencies?: Sep1TomlData["currencies"];
  matchingCurrency?: Sep1TomlData["currencies"] extends Array<infer T> ? T : undefined;
  issuerMatched?: boolean;
  issuerConflict?: boolean;
  issues: string[];
};

async function assertResolvedHostIsPublic(url: string): Promise<string[]> {
  const hostname = new URL(url).hostname;

  if (isPrivateOrLocalHost(hostname)) {
    return ["private or localhost target blocked"];
  }

  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    const privateAddresses = records.map((record) => record.address).filter(isPrivateOrLocalHost);

    return privateAddresses.length > 0 ? [`DNS resolves to private or local address: ${privateAddresses.join(", ")}`] : [];
  } catch (err) {
    return [`DNS resolution failed: ${err instanceof Error ? err.message : String(err)}`];
  }
}

async function fetchSep1WithGuards(targetUrl: string, controller: AbortController) {
  let currentUrl = targetUrl;

  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const urlSafety = assertSep1FetchAllowed(currentUrl);
    if (!urlSafety.allowed) {
      return { response: null, url: currentUrl, issues: urlSafety.issues };
    }

    const dnsIssues = await assertResolvedHostIsPublic(currentUrl);
    if (dnsIssues.length > 0) {
      return { response: null, url: currentUrl, issues: dnsIssues };
    }

    const response = await fetch(currentUrl, {
      signal: controller.signal,
      redirect: "manual",
      headers: { Accept: "text/plain, text/toml, application/toml, */*" },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { response: null, url: currentUrl, issues: ["redirect missing location"] };
      if (redirectCount === 3) return { response: null, url: currentUrl, issues: ["SEP-1 redirect limit exceeded"] };

      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return { response, url: currentUrl, issues: [] };
  }

  return { response: null, url: currentUrl, issues: ["SEP-1 redirect limit exceeded"] };
}
export async function fetchSep1Metadata(
  homeDomain: string,
  assetRef?: { symbol?: string; issuer?: string; contractId?: string }
): Promise<Sep1MetadataResult> {
  const cleanedDomain = homeDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const targetUrl = `https://${cleanedDomain}/.well-known/stellar.toml`;

  const safetyCheck = assertSep1FetchAllowed(targetUrl);
  if (!safetyCheck.allowed) {
    return {
      fetched: false,
      homeDomain: cleanedDomain,
      url: targetUrl,
      issues: safetyCheck.issues,
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const guarded = await fetchSep1WithGuards(targetUrl, controller);
    clearTimeout(timer);

    if (!guarded.response) {
      return {
        fetched: false,
        homeDomain: cleanedDomain,
        url: guarded.url,
        issues: guarded.issues,
      };
    }

    const response = guarded.response;
    const resolvedUrl = guarded.url;

    if (!response.ok) {
      return {
        fetched: false,
        homeDomain: cleanedDomain,
        url: resolvedUrl,
        issues: [`HTTP status ${response.status}`],
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > 250_000) {
      return {
        fetched: false,
        homeDomain: cleanedDomain,
        url: resolvedUrl,
        issues: ["SEP-1 response size limit exceeded"],
      };
    }

    const text = await response.text();

    const responseSafety = assertSep1FetchAllowed(resolvedUrl, contentType, text.length);
    if (!responseSafety.allowed) {
      return {
        fetched: false,
        homeDomain: cleanedDomain,
        url: resolvedUrl,
        issues: responseSafety.issues,
      };
    }
    const parsed = parseSep1Toml(text);
    let matchingCurrency: NonNullable<Sep1TomlData["currencies"]>[number] | undefined;
    let issuerMatched = false;
    let issuerConflict = false;

    if (assetRef && parsed.currencies) {
      matchingCurrency = parsed.currencies.find((c) => {
        if (assetRef.symbol && c.code && c.code.toUpperCase() !== assetRef.symbol.toUpperCase()) return false;
        if (assetRef.issuer && c.issuer && c.issuer.toUpperCase() === assetRef.issuer.toUpperCase()) return true;
        if (assetRef.contractId && c.contract && c.contract.toUpperCase() === assetRef.contractId.toUpperCase()) return true;
        return Boolean(assetRef.symbol && c.code && c.code.toUpperCase() === assetRef.symbol.toUpperCase());
      });

      if (matchingCurrency && assetRef.issuer && matchingCurrency.issuer) {
        if (matchingCurrency.issuer.toUpperCase() === assetRef.issuer.toUpperCase()) {
          issuerMatched = true;
        } else {
          issuerConflict = true;
        }
      }
    }

    const issues: string[] = [];
    if (issuerConflict) {
      issues.push(`Declared SEP-1 issuer (${matchingCurrency?.issuer}) conflicts with target issuer (${assetRef?.issuer})`);
    }

    return {
      fetched: true,
      homeDomain: cleanedDomain,
      url: resolvedUrl,
      documentation: parsed.documentation,
      currencies: parsed.currencies,
      matchingCurrency,
      issuerMatched,
      issuerConflict,
      issues,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      fetched: false,
      homeDomain: cleanedDomain,
      url: targetUrl,
      issues: [errorMsg],
    };
  }
}





