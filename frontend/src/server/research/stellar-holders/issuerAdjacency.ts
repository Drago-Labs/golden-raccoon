/**
 * Issuer-adjacent accounts versus the public float.
 *
 * The issuer account is always adjacent. Distribution accounts are taken only
 * from the matching `[[CURRENCIES]]` block in stellar.toml (`distribution_account`
 * and `distribution_accounts`). SEP-1 `ACCOUNTS` lists organisational addresses
 * and is not treated as a distribution list. The issuer stays `issuer` even
 * when the toml repeats that address as a distributor.
 */
import type { HolderRole } from "./schema";

export type ClassifiedHolder = {
  accountId: string;
  balance: string;
  role: HolderRole;
};

export function classifyIssuerAdjacency(
  holders: readonly { accountId: string; balance: string }[],
  issuer: string,
  distributionAccounts: readonly string[],
): ClassifiedHolder[] {
  const distributors = new Set(distributionAccounts.map((account) => account.trim()).filter((account) => account.length > 0 && account !== issuer));

  return holders.map((holder) => {
    const accountId = holder.accountId.trim();
    let role: HolderRole = "public";

    if (accountId === issuer) role = "issuer";
    else if (distributors.has(accountId)) role = "distribution";

    return { accountId, balance: holder.balance, role };
  });
}

export function distributionAccountsFromToml(toml: string, code: string, issuer: string): string[] {
  const blocks = toml.split(/\[\[CURRENCIES\]\]/i).slice(1);
  const accounts: string[] = [];

  for (const block of blocks) {
    const body = block.split(/\n\s*\[\[/)[0] ?? block;
    const entryCode = readTomlString(body, "code");
    const entryIssuer = readTomlString(body, "issuer");

    if (!entryCode || entryCode !== code || entryIssuer !== issuer) continue;

    const single = readTomlString(body, "distribution_account");

    if (single) accounts.push(single);

    accounts.push(...readTomlStringArray(body, "distribution_accounts"));
  }

  return [...new Set(accounts)];
}

export function stellarTomlUrl(homeDomain: string): string | null {
  const host = homeDomain.trim().replace(/^https?:\/\//i, "").split("/")[0]?.split(":")[0]?.toLowerCase() ?? "";

  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost")) return null;

  return `https://${host}/.well-known/stellar.toml`;
}

function readTomlString(block: string, key: string): string | null {
  const match = block.match(new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']\\s*$`, "im"));

  return match?.[1] ?? null;
}

function readTomlStringArray(block: string, key: string): string[] {
  const match = block.match(new RegExp(`^\\s*${key}\\s*=\\s*\\[([^\\]]*)\\]`, "im"));

  if (!match) return [];

  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((item) => item[1]);
}
