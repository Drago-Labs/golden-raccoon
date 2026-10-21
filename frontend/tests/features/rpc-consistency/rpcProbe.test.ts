// @vitest-environment node
import "./rpcProbe.prelude";
import { Address, Keypair, xdr } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { MAINNET_IDENTITY, TESTNET_IDENTITY } from "@/server/research/rpc-consistency/networkIdentity";
import { decodeLedgerEntryXdr, ledgerKeysFor, readRpc } from "@/server/research/rpc-consistency/rpcProbe";
import type { ProbeTarget } from "@/server/research/rpc-consistency/schema";
import { ACCOUNT, CONTRACT, ISSUER } from "./fixtures";

const account = Keypair.fromPublicKey(ACCOUNT);
const issuer = Keypair.fromPublicKey(ISSUER);

function ledgerXdr(data: xdr.LedgerEntryData, sequence: number): string {
  return new xdr.LedgerEntry({
    lastModifiedLedgerSeq: sequence,
    data,
    ext: xdr.LedgerEntryExt.v0(),
  }).toXDR("base64");
}

function accountXdr(): string {
  return ledgerXdr(
    xdr.LedgerEntryData.account(
      new xdr.AccountEntry({
        accountId: account.xdrAccountId(),
        balance: 100000000n,
        seqNum: 123456789n,
        numSubEntries: 1,
        inflationDest: null,
        flags: 0,
        homeDomain: "",
        thresholds: Uint8Array.from([1, 0, 0, 0]),
        signers: [],
        ext: xdr.AccountEntryExt.v0(),
      }),
    ),
    5000,
  );
}

function trustlineXdr(): string {
  return ledgerXdr(
    xdr.LedgerEntryData.trustline(
      new xdr.TrustLineEntry({
        accountId: account.xdrAccountId(),
        asset: xdr.TrustLineAsset.assetTypeCreditAlphanum4(
          new xdr.AlphaNum4({ assetCode: "USDC", issuer: issuer.xdrAccountId() }),
        ),
        balance: 250000000n,
        limit: 1000000000n,
        flags: 0,
        ext: xdr.TrustLineEntryExt.v0(),
      }),
    ),
    5000,
  );
}

function contractXdr(): string {
  const key = xdr.ScVal.scvSymbol("counter");

  return ledgerXdr(
    xdr.LedgerEntryData.contractData(
      new xdr.ContractDataEntry({
        ext: xdr.ExtensionPoint.v0(),
        contract: new Address(CONTRACT).toScAddress(),
        key,
        durability: xdr.ContractDataDurability.persistent,
        val: xdr.ScVal.scvU32(7),
      }),
    ),
    5000,
  );
}

function target(identity: typeof TESTNET_IDENTITY, kind: ProbeTarget["kind"]): ProbeTarget {
  return {
    network: identity.id,
    horizonUrl: identity.horizonUrl,
    rpcUrl: identity.rpcUrl,
    passphrase: identity.passphrase,
    kind,
    id: kind === "account" ? ACCOUNT : CONTRACT,
    trustlines: kind === "account" ? [{ code: "USDC", issuer: ISSUER }] : [],
    contractDataKeys: kind === "contract" ? ["counter"] : [],
  };
}

describe("rpc probe", () => {
  it("decodes the LedgerEntryData document Stellar RPC returns", () => {
    const captured =
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGodabQBAAXqMAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAA";
    const decoded = decodeLedgerEntryXdr(captured, 4973036);

    expect(decoded.account?.nativeBalanceStroops).toBe("455760000001");
    expect(decoded.account?.sequence).toBe("1664866762883072");
    expect(decoded.account?.ledger).toBe(4973036);
  });

  it("decodes an account entry's balance, sequence, and ledger", () => {
    const decoded = decodeLedgerEntryXdr(accountXdr(), null);

    expect(decoded.account?.nativeBalanceStroops).toBe("100000000");
    expect(decoded.account?.sequence).toBe("123456789");
    expect(decoded.account?.ledger).toBe(5000);
  });

  it("decodes a trustline and a contract data entry", () => {
    const trustline = decodeLedgerEntryXdr(trustlineXdr(), null).trustline;
    const contract = decodeLedgerEntryXdr(contractXdr(), null).contract;

    expect(trustline?.code).toBe("USDC");
    expect(trustline?.issuer).toBe(ISSUER);
    expect(trustline?.balanceStroops).toBe("250000000");
    expect(contract?.key).toBe("counter");
    expect(contract?.ledger).toBe(5000);
    expect(contract?.value).toContain("7");
  });

  it("reads ledger entries and the retention window from the testnet RPC", async () => {
    const seen: Array<{ url: string; method: string }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { method: string };
      seen.push({ url: String(input), method: body.method });

      const results: Record<string, unknown> = {
        getLatestLedger: { sequence: 5100 },
        getNetwork: { passphrase: TESTNET_IDENTITY.passphrase },
        getEvents: { oldestLedger: 1000, latestLedger: 5100, events: [] },
        getLedgerEntries: {
          latestLedger: 5100,
          entries: [
            { xdr: accountXdr(), lastModifiedLedgerSeq: 5000 },
            { xdr: trustlineXdr(), lastModifiedLedgerSeq: 5000 },
          ],
        },
      };

      return {
        ok: true,
        status: 200,
        json: async () => ({ jsonrpc: "2.0", id: 1, result: results[body.method] }),
      };
    }) as typeof fetch;

    const result = await readRpc(target(TESTNET_IDENTITY, "account"), fetchImpl);

    expect(seen.every((call) => call.url === TESTNET_IDENTITY.rpcUrl)).toBe(true);
    expect(seen.map((call) => call.method)).toEqual(["getLatestLedger", "getNetwork", "getEvents", "getLedgerEntries"]);
    expect(result.status).toBe("available");
    if (result.status !== "available" || !result.observation.account) return;

    expect(result.observation.latestLedger).toBe(5100);
    expect(result.observation.retentionStartLedger).toBe(1000);
    expect(result.observation.retentionEndLedger).toBe(5100);
    expect(result.observation.account.nativeBalanceStroops).toBe("100000000");
    expect(result.observation.account.trustlines[0]?.code).toBe("USDC");
    expect(result.observation.contractDataExposed).toBe(true);
  });

  it("compares a contract data key through getLedgerEntries", async () => {
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { method: string };
      const results: Record<string, unknown> = {
        getLatestLedger: { sequence: 80 },
        getNetwork: { passphrase: TESTNET_IDENTITY.passphrase },
        getEvents: { oldestLedger: 10, latestLedger: 80, events: [] },
        getLedgerEntries: { entries: [{ xdr: contractXdr(), lastModifiedLedgerSeq: 5000 }] },
      };

      return { ok: true, status: 200, json: async () => ({ result: results[body.method] }) };
    }) as typeof fetch;

    const keys = ledgerKeysFor(target(TESTNET_IDENTITY, "contract"));
    const result = await readRpc(target(TESTNET_IDENTITY, "contract"), fetchImpl);

    expect(keys.keys.length).toBe(1);
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.observation.contractEntries[0]?.key).toBe("counter");
    expect(result.observation.account).toBeNull();
  });

  it("is unavailable when getLatestLedger fails, and it still uses the mainnet host", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      seen.push(String(input));

      return { ok: false, status: 503, json: async () => ({}) };
    }) as typeof fetch;

    const result = await readRpc(target(MAINNET_IDENTITY, "account"), fetchImpl);

    expect(result.status).toBe("unavailable");
    expect(seen[0]).toBe(MAINNET_IDENTITY.rpcUrl);
    expect(seen.some((url) => url === TESTNET_IDENTITY.rpcUrl)).toBe(false);
  });
});
