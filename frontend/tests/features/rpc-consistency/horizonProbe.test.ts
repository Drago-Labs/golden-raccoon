import { describe, expect, it } from "vitest";
import { readHorizon } from "@/server/research/rpc-consistency/horizonProbe";
import { TESTNET_IDENTITY, MAINNET_IDENTITY } from "@/server/research/rpc-consistency/networkIdentity";
import type { ProbeTarget } from "@/server/research/rpc-consistency/schema";
import { ACCOUNT, ISSUER } from "./fixtures";

function target(identity: typeof TESTNET_IDENTITY): ProbeTarget {
  return {
    network: identity.id,
    horizonUrl: identity.horizonUrl,
    rpcUrl: identity.rpcUrl,
    passphrase: identity.passphrase,
    kind: "account",
    id: ACCOUNT,
    trustlines: [],
    contractDataKeys: [],
  };
}

function respond(routes: Record<string, { status?: number; body: unknown }>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const route = routes[url];

    if (!route) throw new Error(`unexpected ${url}`);

    const status = route.status ?? 200;

    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(route.body),
    };
  }) as typeof fetch;
}

describe("horizon probe", () => {
  it("reads the account document and the retention window from testnet", async () => {
    const identity = TESTNET_IDENTITY;
    const seen: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      seen.push(url);

      if (url === identity.horizonUrl) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              history_latest_ledger: 5100,
              history_elder_ledger: 1000,
              network_passphrase: identity.passphrase,
            }),
        };
      }

      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: ACCOUNT,
            sequence: "123456789",
            last_modified_ledger: 5000,
            balances: [
              { asset_type: "native", balance: "10.0000000" },
              {
                asset_type: "credit_alphanum4",
                asset_code: "USDC",
                asset_issuer: ISSUER,
                balance: "25.0000000",
                limit: "100.0000000",
              },
            ],
          }),
      };
    }) as typeof fetch;

    const result = await readHorizon(target(identity), fetchImpl);

    expect(seen.every((url) => url.startsWith(identity.horizonUrl))).toBe(true);
    expect(seen.some((url) => url.includes("horizon.stellar.org") && !url.includes("testnet"))).toBe(false);
    expect(result.status).toBe("available");

    if (result.status !== "available") return;

    expect(result.observation.latestLedger).toBe(5100);
    expect(result.observation.retentionStartLedger).toBe(1000);
    expect(result.observation.account?.nativeBalance).toBe("10.0000000");
    expect(result.observation.account?.ledger).toBe(5000);
    expect(result.observation.account?.trustlines[0]?.code).toBe("USDC");
    expect(result.observation.contractDataExposed).toBe(false);
  });

  it("stays available when the account is missing and the root answered", async () => {
    const identity = TESTNET_IDENTITY;
    const result = await readHorizon(
      target(identity),
      respond({
        [identity.horizonUrl]: {
          body: { history_latest_ledger: 8, history_elder_ledger: 1, network_passphrase: identity.passphrase },
        },
        [`${identity.horizonUrl}/accounts/${ACCOUNT}`]: { status: 404, body: { status: 404 } },
      }),
    );

    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.observation.notFound).toBe(true);
    expect(result.observation.account).toBeNull();
    expect(result.observation.latestLedger).toBe(8);
  });

  it("is unavailable when the root request fails", async () => {
    const result = await readHorizon(
      target(MAINNET_IDENTITY),
      respond({
        [MAINNET_IDENTITY.horizonUrl]: { status: 503, body: {} },
      }),
    );

    expect(result.status).toBe("unavailable");
  });

  it("does not call the mainnet host for a testnet target", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      seen.push(String(input));
      throw new Error("stop");
    }) as typeof fetch;

    const result = await readHorizon(target(TESTNET_IDENTITY), fetchImpl);

    expect(result.status).toBe("unavailable");
    expect(seen[0]).toBe(TESTNET_IDENTITY.horizonUrl);
    expect(seen.some((url) => url.startsWith(MAINNET_IDENTITY.horizonUrl))).toBe(false);
  });
});
