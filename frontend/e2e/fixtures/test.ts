import { test as base, type Page } from "@playwright/test";
import { mockTokenScanResult, mockPortfolioSnapshot, mockDefaultRules, mockStellarTokenScanResult } from "./mock-data";

type MockFixtures = {
  mockAllApis: void;
  mockScanApi: (opts?: { returnError?: boolean; isStellar?: boolean }) => Promise<void>;
  mockPortfolioApi: (opts?: { returnError?: boolean }) => Promise<void>;
  mockWalletSession: void;
  setupWalletConnected: void;
  setupStellarWalletConnected: void;
};

export const test = base.extend<MockFixtures>({
  mockAllApis: [
    async ({ page }, use) => {
      await page.route("**/api/scan/token", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockTokenScanResult()) });
      });
      await page.route("**/api/portfolio*", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockPortfolioSnapshot()) });
      });
      await page.route("**/api/agents/**", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ agent: route.url().includes("decision") ? "decision" : "portfolio", score: 42, confidence: 0.85, verdict: "balanced", summary: "Mock agent result.", recommendedAction: "monitor", factors: [], dataQuality: { mode: "live", connectedSources: 2, unavailableSources: 0, mockSources: 0, detail: "Mock" } }) });
      });
      await page.route("**/api/history/**", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "mock-record-id" }) });
      });
      await page.route("**/api/rules", async (route) => {
        if (route.request().method() === "POST") {
          await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
        } else {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockDefaultRules()) });
        }
      });
      await page.route("**/api/x402/terms", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ priceUsd: "$0.99", network: "eip155:8453", asset: "USDC", payTo: "0x3ED3E93047b4bCF2e6Ab0744Db08a132d0c97D7d", available: true }) });
      });
      await page.route("**/api/stellar/**", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      });
      await use();
    },
    { auto: false },
  ],

  mockScanApi: [
    async ({ page }, use) => {
      await use(async (opts?: { returnError?: boolean; isStellar?: boolean }) => {
        const { returnError, isStellar } = opts ?? {};
        await page.route("**/api/scan/token", async (route) => {
          if (returnError) {
            await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Scan failed" }) });
          } else {
            const result = isStellar ? mockStellarTokenScanResult() : mockTokenScanResult();
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result) });
          }
        });
      });
    },
    { auto: false },
  ],

  mockPortfolioApi: [
    async ({ page }, use) => {
      await use(async (opts?: { returnError?: boolean }) => {
        const { returnError } = opts ?? {};
        await page.route("**/api/portfolio*", async (route) => {
          if (returnError) {
            await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Provider unavailable" }) });
          } else {
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockPortfolioSnapshot()) });
          }
        });
      });
    },
    { auto: false },
  ],

  mockWalletSession: [
    async ({ page }, use) => {
      await page.route("**/api/wallet-session/**", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ nonce: "mock-nonce", challenge: "mock-challenge", challengeXdr: "AAAAA...", family: "evm", walletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18", issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), network: null }) });
      });
      await page.route("**/api/wallet-session", async (route) => {
        if (route.request().method() === "POST") {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
        } else if (route.request().method() === "DELETE") {
          await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
        }
      });
      await use();
    },
    { auto: false },
  ],

  setupWalletConnected: [
    async ({ page }, use) => {
      const localStorage = {
        "wagmi.store": JSON.stringify({
          state: {
            data: {
              account: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
              chainId: 8453,
            },
          },
        }),
        "wallet-connected": "true",
      };

      await page.addInitScript((storage) => {
        for (const [key, value] of Object.entries(storage)) {
          if (typeof value === "string") {
            window.localStorage.setItem(key, value);
          }
        }
      }, localStorage);

      await page.route("**/api/portfolio*", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockPortfolioSnapshot()) });
      });

      await page.route("**/api/wallet-session/**", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ nonce: "mock-nonce", challenge: "mock-challenge", challengeXdr: "AAAAA...", family: "evm", walletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18", issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), network: null }) });
      });

      await page.route("**/api/wallet-session", async (route) => {
        if (route.request().method() === "DELETE") {
          await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
        }
      });

      await use();
    },
    { auto: false },
  ],

  setupStellarWalletConnected: [
    async ({ page }, use) => {
      await page.route("**/api/wallet-session/**", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ nonce: "mock-nonce", family: "stellar", walletAddress: "GCVM6QKJKZ6QKJ3Z5H3KJY3J3Z5H3KJY3J3Z5H3KJY3J3Z5H3KJY3J3Z5", issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), network: "Test SDF Network ; September 2015" }) });
      });
      await use();
    },
    { auto: false },
  ],
});

export { expect } from "@playwright/test";
