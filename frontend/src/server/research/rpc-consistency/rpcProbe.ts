/**
 * Read account, trustline, and contract-data ledger entries from Stellar RPC.
 *
 * Account balance and sequence come from the account ledger entry. Trustlines
 * are separate entries, fetched by key. Contract data uses `getLedgerEntries`.
 * Latest ledger and the retention window come from `getLatestLedger`,
 * `getNetwork`, and one bounded `getEvents` page. This module does not call
 * Horizon and does not submit transactions.
 */
import { Address, Keypair, StrKey, scValToNative, xdr } from "@stellar/stellar-sdk";
import { available, unavailable, type ProviderState } from "./errors";
import { batchKeys, CONSISTENCY_LIMITS } from "./limits";
import type {
  ContractDataEntry,
  ProbeTarget,
  RpcAccount,
  RpcObservation,
  RpcTrustline,
  TrustlineHint,
} from "./schema";

type FetchLike = typeof fetch;

type RpcSuccess = {
  ok: true;
  result: unknown;
};

type RpcFailure = {
  ok: false;
  message: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function asLedger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);

  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function byteValue(value: unknown): Uint8Array | null {
  if (!value || typeof value !== "object" || !("value" in value)) return null;

  const inner = (value as { value: unknown }).value;

  return inner instanceof Uint8Array ? inner : null;
}

function textBytes(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("bytes" in value)) return null;

  const bytes = (value as { bytes: unknown }).bytes;

  return bytes instanceof Uint8Array ? Buffer.from(bytes).toString("utf8") : null;
}

function publicKeyOf(accountId: unknown): string | null {
  const record = asRecord(accountId);
  const raw = byteValue(record?.ed25519);

  if (!raw) return null;

  try {
    return StrKey.encodeEd25519PublicKey(Buffer.from(raw));
  } catch {
    return null;
  }
}

function assetCodeOf(code: unknown): string | null {
  const raw = byteValue(code);

  if (!raw) return null;

  const text = Buffer.from(raw).toString("utf8").replace(/\0+$/g, "").trim();

  return text === "" ? null : text;
}

function canonicalValue(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item));
}

function integerText(value: unknown): string | null {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return value;

  return null;
}

async function rpcCall(url: string, method: string, params: unknown, fetchImpl: FetchLike): Promise<RpcSuccess | RpcFailure> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(CONSISTENCY_LIMITS.timeoutMs),
  });

  if (!response.ok) {
    return { ok: false, message: `Stellar RPC ${method} returned HTTP ${response.status}.` };
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return { ok: false, message: `Stellar RPC ${method} did not return JSON.` };
  }

  const record = asRecord(body);
  const error = asRecord(record?.error);

  if (error) {
    return { ok: false, message: asString(error.message) ?? `Stellar RPC ${method} failed.` };
  }

  return { ok: true, result: record?.result };
}

function trustlineAsset(hint: TrustlineHint): xdr.TrustLineAsset | null {
  if (hint.code.length < 1 || hint.code.length > 12) return null;

  try {
    const issuer = Keypair.fromPublicKey(hint.issuer).xdrAccountId();

    if (hint.code.length <= 4) {
      return xdr.TrustLineAsset.assetTypeCreditAlphanum4(new xdr.AlphaNum4({ assetCode: hint.code, issuer }));
    }

    return xdr.TrustLineAsset.assetTypeCreditAlphanum12(new xdr.AlphaNum12({ assetCode: hint.code, issuer }));
  } catch {
    return null;
  }
}

function contractKey(contractId: string, name: string): xdr.LedgerKey {
  const key = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
    ? xdr.ScVal.scvSymbol(name)
    : xdr.ScVal.scvString(name);

  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key,
      durability: xdr.ContractDataDurability.persistent,
    }),
  );
}

/** Ledger keys for this target, in a stable order, capped by the page bounds. */
export function ledgerKeysFor(target: ProbeTarget): { keys: string[]; omitted: number } {
  const encoded: string[] = [];

  if (target.kind === "account") {
    encoded.push(
      xdr.LedgerKey.account(
        new xdr.LedgerKeyAccount({ accountId: Keypair.fromPublicKey(target.id).xdrAccountId() }),
      ).toXDR("base64"),
    );

    for (const hint of target.trustlines) {
      const asset = trustlineAsset(hint);

      if (!asset) continue;

      encoded.push(
        xdr.LedgerKey.trustline(
          new xdr.LedgerKeyTrustLine({
            accountId: Keypair.fromPublicKey(target.id).xdrAccountId(),
            asset,
          }),
        ).toXDR("base64"),
      );
    }
  }

  if (target.kind === "contract") {
    for (const name of target.contractDataKeys) {
      encoded.push(contractKey(target.id, name).toXDR("base64"));
    }
  }

  const batched = batchKeys(encoded, CONSISTENCY_LIMITS.pageSize, CONSISTENCY_LIMITS.maxPages);

  return { keys: batched.pages.flat(), omitted: batched.omitted };
}

function readTrustline(entry: xdr.TrustLineEntry, ledger: number | null, raw: unknown): RpcTrustline | null {
  const asset = entry.asset;
  const alpha = asset.type === "assetTypeCreditAlphanum4" ? asset.alphaNum4 : asset.type === "assetTypeCreditAlphanum12" ? asset.alphaNum12 : null;

  if (!alpha) return null;

  const code = assetCodeOf(alpha.assetCode);
  const issuer = publicKeyOf(alpha.issuer);

  if (!code || !issuer) return null;

  return {
    code,
    issuer,
    balanceStroops: integerText(entry.balance),
    limitStroops: integerText(entry.limit),
    ledger,
    raw,
  };
}

function contractKeyName(key: xdr.ScVal): string {
  if (key.type === "scvSymbol") return textBytes(key.sym) ?? "symbol";
  if (key.type === "scvString") return textBytes(key.str) ?? "string";

  return `xdr:${key.toXDR("base64")}`;
}

function readContractData(entry: xdr.ContractDataEntry, ledger: number | null, raw: unknown): ContractDataEntry {
  let value: string | null = null;

  try {
    value = canonicalValue(scValToNative(entry.val));
  } catch {
    value = entry.val.toXDR("base64");
  }

  return {
    key: contractKeyName(entry.key),
    value,
    ledger,
    raw,
  };
}

export function decodeLedgerEntryXdr(xdrBase64: string, ledger: number | null): {
  account: RpcAccount | null;
  trustline: RpcTrustline | null;
  contract: ContractDataEntry | null;
} {
  // Stellar RPC returns LedgerEntryData. A full LedgerEntry is accepted so
  // locally built fixtures still decode, and the ledger then comes from it.
  let data: xdr.LedgerEntryData;
  let entryLedger = ledger;

  try {
    data = xdr.LedgerEntryData.fromXDR(xdrBase64, "base64");
  } catch {
    const decoded = xdr.LedgerEntry.fromXDR(xdrBase64, "base64");
    data = decoded.data;
    entryLedger = asLedger(decoded.lastModifiedLedgerSeq) ?? ledger;
  }

  if (data.type === "account") {
    const account = data.account;

    return {
      account: {
        ledger: entryLedger,
        sequence: integerText(account.seqNum),
        nativeBalanceStroops: integerText(account.balance),
        raw: { xdr: xdrBase64, lastModifiedLedgerSeq: entryLedger },
        trustlines: [],
      },
      trustline: null,
      contract: null,
    };
  }

  if (data.type === "trustline") {
    return {
      account: null,
      trustline: readTrustline(data.trustLine, entryLedger, { xdr: xdrBase64, lastModifiedLedgerSeq: entryLedger }),
      contract: null,
    };
  }

  if (data.type === "contractData") {
    return {
      account: null,
      trustline: null,
      contract: readContractData(data.contractData, entryLedger, { xdr: xdrBase64, lastModifiedLedgerSeq: entryLedger }),
    };
  }

  return { account: null, trustline: null, contract: null };
}

function emptyAccount(): RpcAccount {
  return {
    ledger: null,
    sequence: null,
    nativeBalanceStroops: null,
    raw: null,
    trustlines: [],
  };
}

export async function readRpc(target: ProbeTarget, fetchImpl: FetchLike = fetch): Promise<ProviderState<RpcObservation>> {
  try {
    const latestCall = await rpcCall(target.rpcUrl, "getLatestLedger", {}, fetchImpl);

    if (!latestCall.ok) return unavailable(latestCall.message);

    const latestBody = asRecord(latestCall.result);
    const latestLedger = asLedger(latestBody?.sequence);
    const networkCall = await rpcCall(target.rpcUrl, "getNetwork", {}, fetchImpl);
    const networkBody = networkCall.ok ? asRecord(networkCall.result) : null;
    const passphrase = asString(networkBody?.passphrase);
    let retentionStart = asLedger(latestBody?.oldestLedger) ?? asLedger(networkBody?.oldestLedger);
    let retentionEnd = asLedger(latestBody?.latestLedger) ?? latestLedger;
    const retentionWindow = asLedger(networkBody?.ledgerRetentionWindow);

    if (retentionStart == null && retentionWindow != null && latestLedger != null) {
      retentionStart = Math.max(0, latestLedger - retentionWindow + 1);
    }

    if (latestLedger != null) {
      const events = await rpcCall(
        target.rpcUrl,
        "getEvents",
        {
          startLedger: latestLedger,
          filters: [{ type: "system" }],
          pagination: { limit: 1 },
        },
        fetchImpl,
      );

      if (events.ok) {
        const eventsBody = asRecord(events.result);
        retentionStart = asLedger(eventsBody?.oldestLedger) ?? retentionStart;
        retentionEnd = asLedger(eventsBody?.latestLedger) ?? retentionEnd;
      }
    }

    const { keys, omitted } = ledgerKeysFor(target);
    const account = target.kind === "account" ? emptyAccount() : null;
    const trustlines: RpcTrustline[] = [];
    const contractEntries: ContractDataEntry[] = [];
    const pages = batchKeys(keys, CONSISTENCY_LIMITS.pageSize, CONSISTENCY_LIMITS.maxPages).pages;

    for (const page of pages) {
      if (page.length === 0) continue;

      const entriesCall = await rpcCall(target.rpcUrl, "getLedgerEntries", { keys: page }, fetchImpl);

      if (!entriesCall.ok) {
        return unavailable(entriesCall.message);
      }

      const entriesBody = asRecord(entriesCall.result);
      const entries = Array.isArray(entriesBody?.entries) ? entriesBody.entries : [];

      for (const item of entries) {
        const record = asRecord(item);
        const encoded = asString(record?.xdr);

        if (!encoded) continue;

        const decoded = decodeLedgerEntryXdr(encoded, asLedger(record?.lastModifiedLedgerSeq));

        if (decoded.account && account) {
          account.ledger = decoded.account.ledger;
          account.sequence = decoded.account.sequence;
          account.nativeBalanceStroops = decoded.account.nativeBalanceStroops;
          account.raw = decoded.account.raw;
        }

        if (decoded.trustline) trustlines.push(decoded.trustline);
        if (decoded.contract) contractEntries.push(decoded.contract);
      }
    }

    if (account) account.trustlines = trustlines;

    return available({
      provider: "rpc",
      network: target.network,
      endpoint: target.rpcUrl,
      passphrase,
      latestLedger,
      retentionStartLedger: retentionStart,
      retentionEndLedger: retentionEnd,
      notFound: target.kind === "account" && account?.nativeBalanceStroops == null && account?.sequence == null,
      account,
      contractDataExposed: true,
      contractEntries,
      omittedTrustlines: 0,
      omittedLedgerKeys: omitted,
    });
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : "Stellar RPC could not be read.");
  }
}
