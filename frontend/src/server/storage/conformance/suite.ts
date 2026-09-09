import type { IStorageAdapter } from "../adapters/types";
import { isStorageUniqueViolation, StorageUniqueViolationError } from "../errors";
import type {
  AgentRunRecord,
  AlertDelivery,
  NotificationPreferences,
  RecommendationRecord,
  TransactionRecord,
  TransactionObservation,
  UserApprovalRecord,
  UserRule,
  X402PaymentReceipt,
} from "@/server/types";
import type { RiskSnapshotRecord } from "@/server/snapshots/schema";

/**
 * Expected required adapter methods that must be covered by conformance tests.
 */
export const REQUIRED_ADAPTER_METHODS: (keyof IStorageAdapter)[] = [
  "listAgentRunRecords",
  "getAgentRunRecord",
  "createAgentRunRecord",
  "listRecommendationRecords",
  "createRecommendationRecord",
  "listTransactionRecords",
  "getTransactionRecord",
  "createTransactionRecord",
  "listTransactionObservations",
  "createTransactionObservation",
  "listApprovalRecords",
  "createApprovalRecord",
  "getUserRuleRecord",
  "upsertUserRuleRecord",
  "listX402PaymentReceipts",
  "getX402PaymentReceiptByHeaderHash",
  "createX402PaymentReceipt",
  "getRiskSnapshot",
  "createRiskSnapshot",
  "revokeRiskSnapshot",
  "listAlertDeliveries",
  "getAlertDeliveryByIdempotencyKey",
  "createAlertDelivery",
  "updateAlertDelivery",
  "getNotificationPreferences",
  "upsertNotificationPreferences",
  "getStorageHealth",
  "getStorageCounts",
  "performHealthProbe",
  "addWatchlistEntriesBulk",
  "eraseWalletData",
  "residueCheck",
  "storeErasureReceipt",
  "getErasureReceipt",
];

export interface ConformanceTestCaseResult {
  name: string;
  passed: boolean;
  error?: Error;
}

export interface ConformanceReport {
  adapterProvider: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: ConformanceTestCaseResult[];
}

export class ConformanceSuiteError extends Error {
  constructor(message: string, public readonly failures: ConformanceTestCaseResult[]) {
    super(message);
    this.name = "ConformanceSuiteError";
  }
}

const IGNORED_HELPER_MEMBERS = new Set([
  "constructor",
  "provider",
  "persistent",
  "clear",
  "db",
  "client",
]);

/**
 * Validates adapter method coverage.
 * Introspects the adapter and verifies every public method has a registered test case.
 */
export function checkAdapterMethodCoverage(adapter: IStorageAdapter, registeredMethods: Set<string>): string[] {
  const missingCoverage: string[] = [];

  // Check required methods
  for (const method of REQUIRED_ADAPTER_METHODS) {
    if (!registeredMethods.has(method)) {
      missingCoverage.push(`Required method missing from test registry: ${String(method)}`);
    }
  }

  // Introspect adapter instance and prototype
  const proto = Object.getPrototypeOf(adapter);
  const ownProps = Object.getOwnPropertyNames(adapter);
  const protoProps = proto ? Object.getOwnPropertyNames(proto) : [];
  const allProps = new Set([...ownProps, ...protoProps]);

  for (const prop of allProps) {
    if (IGNORED_HELPER_MEMBERS.has(prop) || prop.startsWith("_")) {
      continue;
    }
    const val = (adapter as any)[prop];
    if (typeof val === "function") {
      if (!registeredMethods.has(prop)) {
        missingCoverage.push(`Uncovered adapter method detected: ${prop}`);
      }
    }
  }

  return missingCoverage;
}

/**
 * Runs the comprehensive conformance test suite against any storage adapter.
 */
export async function runConformanceSuite(
  adapter: IStorageAdapter,
  options?: { reset?: () => Promise<void> | void }
): Promise<ConformanceReport> {
  const results: ConformanceTestCaseResult[] = [];
  const coveredMethods = new Set<string>();

  const recordMethodCoverage = (method: keyof IStorageAdapter) => {
    coveredMethods.add(method);
  };

  REQUIRED_ADAPTER_METHODS.forEach((m) => recordMethodCoverage(m));

  async function executeTest(name: string, fn: () => Promise<void>) {
    if (options?.reset) {
      await options.reset();
    }
    try {
      await fn();
      results.push({ name, passed: true });
    } catch (err) {
      results.push({
        name,
        passed: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  // 1. Adapter Method Coverage Test
  await executeTest("coverage: all public adapter methods have registered conformance tests", async () => {
    const missing = checkAdapterMethodCoverage(adapter, coveredMethods);
    if (missing.length > 0) {
      throw new Error(`Adapter method coverage check failed:\n${missing.join("\n")}`);
    }
  });

  // 2. Health, Counts, and Probe
  await executeTest("health: performHealthProbe and getStorageHealth report operational status", async () => {
    const probe = await adapter.performHealthProbe();
    if (!probe.ok) {
      throw new Error(`Health probe failed: ${probe.detail}`);
    }
    const health = await adapter.getStorageHealth();
    if (!health.provider || typeof health.persistent !== "boolean") {
      throw new Error(`Storage health check failed: provider=${health.provider}, persistent=${health.persistent}`);
    }
    const counts = await adapter.getStorageCounts();
    if (typeof counts.transactions !== "number" || typeof counts.agentRuns !== "number") {
      throw new Error("Storage counts returned invalid types");
    }
  });

  // 3. Transactions: Descending Ordering Invariance
  await executeTest("ordering: listTransactionRecords returns records in descending createdAt order", async () => {
    const wallet = "0x" + "1".repeat(40);
    const hash1 = "0x" + "a".repeat(64);
    const hash2 = "0x" + "b".repeat(64);
    const hash3 = "0x" + "c".repeat(64);

    const t1 = "2026-01-01T10:00:00.000Z";
    const t2 = "2026-01-01T11:00:00.000Z";
    const t3 = "2026-01-01T12:00:00.000Z";

    await adapter.createTransactionRecord({
      hash: hash1,
      type: "transfer",
      asset: "ETH",
      valueUsd: 10,
      status: "pending",
      lifecycleStatus: "pending",
      chainFamily: "evm",
      walletAddress: wallet,
      network: "ethereum-mainnet",
      createdAt: t1,
    });

    await adapter.createTransactionRecord({
      hash: hash3,
      type: "transfer",
      asset: "ETH",
      valueUsd: 30,
      status: "pending",
      lifecycleStatus: "pending",
      chainFamily: "evm",
      walletAddress: wallet,
      network: "ethereum-mainnet",
      createdAt: t3,
    });

    await adapter.createTransactionRecord({
      hash: hash2,
      type: "transfer",
      asset: "ETH",
      valueUsd: 20,
      status: "pending",
      lifecycleStatus: "pending",
      chainFamily: "evm",
      walletAddress: wallet,
      network: "ethereum-mainnet",
      createdAt: t2,
    });

    const list = await adapter.listTransactionRecords(wallet);
    if (list.length < 3) {
      throw new Error(`Expected at least 3 transactions, got ${list.length}`);
    }
    const filtered = list.filter((r) => [hash1, hash2, hash3].includes(r.hash));
    if (filtered[0].hash !== hash3 || filtered[1].hash !== hash2 || filtered[2].hash !== hash1) {
      throw new Error(
        `Transactions not in descending order: got [${filtered.map((r) => r.createdAt).join(", ")}]`
      );
    }
  });

  // 4. Transactions: Uniqueness Violation Enforcement
  await executeTest("uniqueness: createTransactionRecord duplicate hash throws StorageUniqueViolationError", async () => {
    const wallet = "0x" + "2".repeat(40);
    const hash = "0x" + "d".repeat(64);
    const tx: TransactionRecord = {
      hash,
      type: "transfer",
      asset: "USDC",
      valueUsd: 50,
      status: "pending",
      lifecycleStatus: "pending",
      chainFamily: "evm",
      walletAddress: wallet,
      network: "ethereum-mainnet",
      createdAt: new Date().toISOString(),
    };

    await adapter.createTransactionRecord(tx);

    let caught: any = null;
    try {
      await adapter.createTransactionRecord(tx);
    } catch (err) {
      caught = err;
    }

    if (!caught) {
      throw new Error("Duplicate transaction write did not throw");
    }
    if (!isStorageUniqueViolation(caught)) {
      throw new Error(`Expected StorageUniqueViolationError, got ${caught?.name || typeof caught}: ${caught?.message}`);
    }
  });

  // 5. Transactions: Null Handling Invariance
  await executeTest("nullability: transaction nullable fields preserved without empty string coercion", async () => {
    const wallet = "0x" + "3".repeat(40);
    const hash = "0x" + "e".repeat(64);
    const tx: TransactionRecord = {
      hash,
      type: "approval",
      asset: "USDC",
      valueUsd: 0,
      status: "pending",
      lifecycleStatus: "pending",
      chainFamily: "evm",
      walletAddress: wallet,
      network: "ethereum-mainnet",
      createdAt: new Date().toISOString(),
      decisionId: undefined,
      decisionAction: undefined,
      replacementHash: undefined,
      manualReviewReason: undefined,
    };

    await adapter.createTransactionRecord(tx);
    const retrieved = await adapter.getTransactionRecord(hash);
    if (!retrieved) {
      throw new Error("Failed to retrieve created transaction");
    }
    if (retrieved.decisionId === "") {
      throw new Error("Nullability violation: decisionId coerced to empty string");
    }
    if (retrieved.replacementHash === "") {
      throw new Error("Nullability violation: replacementHash coerced to empty string");
    }
  });

  // 6. Transaction Observations: Ordering and Creation
  await executeTest("observations: create and list observations in descending observedAt order", async () => {
    const hash = "0x" + "f".repeat(64);
    await adapter.createTransactionRecord({
      hash,
      type: "transfer",
      asset: "USDC",
      valueUsd: 50,
      status: "pending",
      lifecycleStatus: "pending",
      chainFamily: "evm",
      walletAddress: "0x" + "2".repeat(40),
      network: "ethereum-mainnet",
      createdAt: new Date().toISOString(),
    });
    const now = Date.now();
    const obs1: TransactionObservation = {
      id: "obs_1",
      hash,
      evidenceKey: `ev_${now}_1`,
      chainFamily: "evm",
      network: "ethereum-mainnet",
      provider: "rpc",
      status: "pending",
      confirmations: 0,
      requiredConfirmations: 1,
      observedAt: new Date(now - 2000).toISOString(),
    };
    const obs2: TransactionObservation = {
      id: "obs_2",
      hash,
      evidenceKey: `ev_${now}_2`,
      chainFamily: "evm",
      network: "ethereum-mainnet",
      provider: "rpc",
      status: "confirmed",
      confirmations: 1,
      requiredConfirmations: 1,
      observedAt: new Date(now).toISOString(),
    };

    await adapter.createTransactionObservation(obs1);
    await adapter.createTransactionObservation(obs2);

    const list = await adapter.listTransactionObservations(hash);
    if (list.length < 2) {
      throw new Error(`Expected at least 2 observations, got ${list.length}`);
    }
    if (new Date(list[0].observedAt).getTime() < new Date(list[1].observedAt).getTime()) {
      throw new Error("Observations not sorted in descending observedAt order");
    }
  });

  // 7. Agent Runs: Create, Get, Ordering, and Uniqueness
  await executeTest("agent_runs: create, get, and descending ordering invariance", async () => {
    const wallet = "0x" + "4".repeat(40);
    const id1 = "run_11111111-1111-4111-a111-111111111111";
    const id2 = "run_22222222-2222-4222-a222-222222222222";

    const t1 = "2026-02-01T10:00:00.000Z";
    const t2 = "2026-02-01T11:00:00.000Z";

    await adapter.createAgentRunRecord({
      id: id1,
      walletAddress: wallet,
      mode: "portfolio_review",
      status: "completed",
      recommendation: "execute",
      decisionScore: 85,
      confidence: 0.9,
      summary: "Run 1",
      results: [],
      sourceStatuses: [],
      inputSnapshot: {},
      userAction: "approved",
      createdAt: t1,
    });

    await adapter.createAgentRunRecord({
      id: id2,
      walletAddress: wallet,
      mode: "portfolio_review",
      status: "completed",
      recommendation: "no_action",
      decisionScore: 40,
      confidence: 0.8,
      summary: "Run 2",
      results: [],
      sourceStatuses: [],
      inputSnapshot: {},
      userAction: "rejected",
      createdAt: t2,
    });

    const retrieved = await adapter.getAgentRunRecord(id1);
    if (!retrieved || retrieved.summary !== "Run 1") {
      throw new Error("getAgentRunRecord did not return correct record");
    }

    const list = await adapter.listAgentRunRecords(wallet);
    if (list.length < 2) {
      throw new Error("listAgentRunRecords returned fewer than 2 records");
    }
    if (new Date(list[0].createdAt).getTime() < new Date(list[1].createdAt).getTime()) {
      throw new Error("listAgentRunRecords not in descending order");
    }
  });

  // 8. Recommendations: Create and Descending Ordering
  await executeTest("recommendations: create and descending ordering", async () => {
    const wallet = "0x" + "5".repeat(40);
    const rec1: RecommendationRecord = {
      id: "rec_11111111-1111-4111-a111-111111111111",
      walletAddress: wallet,
      action: "execute",
      decisionScore: 90,
      confidence: 0.95,
      summary: "Rec 1",
      createdAt: "2026-03-01T10:00:00.000Z",
    };
    const rec2: RecommendationRecord = {
      id: "rec_22222222-2222-4222-a222-222222222222",
      walletAddress: wallet,
      action: "manual_review",
      decisionScore: 60,
      confidence: 0.7,
      summary: "Rec 2",
      createdAt: "2026-03-01T11:00:00.000Z",
    };

    await adapter.createRecommendationRecord(rec1);
    await adapter.createRecommendationRecord(rec2);

    const list = await adapter.listRecommendationRecords(wallet);
    if (list.length < 2) {
      throw new Error("listRecommendationRecords returned fewer than 2 records");
    }
    if (new Date(list[0].createdAt).getTime() < new Date(list[1].createdAt).getTime()) {
      throw new Error("listRecommendationRecords not in descending order");
    }
  });

  // 9. Approvals: Create and Descending Ordering
  await executeTest("approvals: create and descending ordering", async () => {
    const wallet = "0x" + "6".repeat(40);
    const app1: UserApprovalRecord = {
      id: "app_11111111-1111-4111-a111-111111111111",
      walletAddress: wallet,
      network: "ethereum-mainnet",
      txHash: "0x" + "1".repeat(64),
      status: "confirmed",
      autoExecuted: false,
      createdAt: "2026-04-01T10:00:00.000Z",
    };
    const app2: UserApprovalRecord = {
      id: "app_22222222-2222-4222-a222-222222222222",
      walletAddress: wallet,
      network: "ethereum-mainnet",
      txHash: "0x" + "2".repeat(64),
      status: "confirmed",
      autoExecuted: false,
      createdAt: "2026-04-01T11:00:00.000Z",
    };

    await adapter.createApprovalRecord(app1);
    await adapter.createApprovalRecord(app2);

    const list = await adapter.listApprovalRecords(wallet);
    if (list.length < 2) {
      throw new Error("listApprovalRecords returned fewer than 2 records");
    }
    if (new Date(list[0].createdAt).getTime() < new Date(list[1].createdAt).getTime()) {
      throw new Error("listApprovalRecords not in descending order");
    }
  });

  // 10. User Rules: Upsert and Get
  await executeTest("user_rules: upsert and get round-trip", async () => {
    const wallet = "0x" + "7".repeat(40);
    const rule: UserRule = {
      walletAddress: wallet,
      maxRiskScore: 65,
      maxTradePercent: 20,
      maxMemeExposurePercent: 15,
      maxDailyTransactionValueUsd: 5000,
      maxSlippageBps: 100,
      allowedChains: ["ethereum", "arbitrum"],
      blockedTokens: ["0xbad"],
      allowedActions: ["swap"],
      autoExecute: false,
      createdAt: new Date().toISOString(),
    };

    await adapter.upsertUserRuleRecord(rule);
    const retrieved = await adapter.getUserRuleRecord(wallet);
    if (!retrieved) {
      throw new Error("getUserRuleRecord returned null after upsert");
    }
    if (retrieved.maxRiskScore !== 65 || retrieved.maxDailyTransactionValueUsd !== 5000) {
      throw new Error("User rule values corrupted in round-trip");
    }

    rule.maxRiskScore = 80;
    await adapter.upsertUserRuleRecord(rule);
    const updated = await adapter.getUserRuleRecord(wallet);
    if (updated?.maxRiskScore !== 80) {
      throw new Error("User rule update did not persist new maxRiskScore");
    }
  });

  // 11. x402 Receipts: Create, Get, and Uniqueness
  await executeTest("x402: create, get by header hash, and unique violation", async () => {
    const headerHash = "0xheader_" + Date.now();
    const receipt: X402PaymentReceipt = {
      id: "x402_" + Date.now(),
      requestId: "req_1",
      paymentHeaderHash: headerHash,
      chainFamily: "evm",
      network: "base-mainnet",
      asset: "USDC",
      amount: "1.00",
      priceUsd: "1.00",
      payTo: "0xmerchant",
      facilitatorUrl: "https://x402.org",
      protectedResource: "/api/pro",
      requestBodyHash: "0xbody",
      verificationStatus: "verified",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await adapter.createX402PaymentReceipt(receipt);
    const retrieved = await adapter.getX402PaymentReceiptByHeaderHash(headerHash);
    if (!retrieved || retrieved.paymentHeaderHash !== headerHash) {
      throw new Error("getX402PaymentReceiptByHeaderHash failed");
    }

    let caught: any = null;
    try {
      await adapter.createX402PaymentReceipt(receipt);
    } catch (err) {
      caught = err;
    }
    if (!caught || !isStorageUniqueViolation(caught)) {
      throw new Error("Duplicate x402 paymentHeaderHash did not throw StorageUniqueViolationError");
    }

    const list = await adapter.listX402PaymentReceipts();
    if (list.length === 0) {
      throw new Error("listX402PaymentReceipts returned empty list");
    }
  });

  // 12. Public Risk Snapshots: Create, Get, Revoke, and Uniqueness
  await executeTest("snapshots: create, get, revoke, and unique violation", async () => {
    const id = "snap_" + Date.now();
    const snapshotRecord: RiskSnapshotRecord = {
      id,
      schemaVersion: "1.0.0",
      snapshot: {
        symbol: "TEST",
        riskScore: 30,
        riskLevel: "low",
        flags: [],
        timestamp: new Date().toISOString(),
      } as any,
      canonicalHash: "sha256:" + "a".repeat(64),
      identityKey: "test:token",
      revocationTokenHash: "sha256:" + "b".repeat(64),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };

    await adapter.createRiskSnapshot(snapshotRecord);
    const retrieved = await adapter.getRiskSnapshot(id);
    if (!retrieved || retrieved.id !== id) {
      throw new Error("getRiskSnapshot failed to retrieve created snapshot");
    }

    let caught: any = null;
    try {
      await adapter.createRiskSnapshot(snapshotRecord);
    } catch (err) {
      caught = err;
    }
    if (!caught || !isStorageUniqueViolation(caught)) {
      throw new Error("Duplicate risk snapshot id did not throw StorageUniqueViolationError");
    }

    const revokedAt = new Date().toISOString();
    const revoked = await adapter.revokeRiskSnapshot(id, revokedAt);
    if (!revoked || !revoked.revokedAt) {
      throw new Error("revokeRiskSnapshot failed to update revokedAt");
    }
  });

  // 13. Alert Deliveries: Create, Get by Idempotency Key, Update, and List
  await executeTest("alerts: delivery create, get by idempotency, update, and list", async () => {
    const wallet = "0x" + "8".repeat(40);
    const id = "deliv_" + Date.now();
    const idemKey = "idem_" + Date.now();
    const delivery: AlertDelivery = {
      id,
      alertId: "alert_1",
      walletAddress: wallet,
      channel: "in_app",
      idempotencyKey: idemKey,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    await adapter.createAlertDelivery(delivery);
    const retrieved = await adapter.getAlertDeliveryByIdempotencyKey(wallet, idemKey);
    if (!retrieved || retrieved.id !== id) {
      throw new Error("getAlertDeliveryByIdempotencyKey failed");
    }

    const updated = await adapter.updateAlertDelivery(id, wallet, { status: "delivered", sentAt: new Date().toISOString() });
    if (!updated || updated.status !== "delivered") {
      throw new Error("updateAlertDelivery failed");
    }

    const list = await adapter.listAlertDeliveries(undefined, wallet);
    if (list.length === 0) {
      throw new Error("listAlertDeliveries returned empty array");
    }
  });

  // 14. Notification Preferences: Upsert and Get
  await executeTest("preferences: upsert and get notification preferences", async () => {
    const wallet = "0x" + "9".repeat(40);
    const prefs: NotificationPreferences = {
      id: "pref_" + Date.now(),
      walletAddress: wallet,
      chainFamily: "evm",
      network: "ethereum-mainnet",
      channels: {
        in_app: { enabled: true },
        email: { enabled: false },
        telegram: { enabled: false },
        discord: { enabled: false },
      },
      quietHours: { enabled: false, start: "22:00", end: "07:00", timeZone: "UTC" },
      digestCadence: "off",
      dedupeWindowMinutes: 30,
      updatedAt: new Date().toISOString(),
    };

    await adapter.upsertNotificationPreferences(prefs);
    const retrieved = await adapter.getNotificationPreferences({
      walletAddress: wallet,
      chainFamily: "evm",
      network: "ethereum-mainnet",
    });
    if (!retrieved || !retrieved.channels?.in_app?.enabled) {
      throw new Error("getNotificationPreferences failed");
    }
  });

  // 15. Watchlist: addWatchlistEntriesBulk
  await executeTest("watchlist: addWatchlistEntriesBulk persists entries", async () => {
    if (adapter.addWatchlistEntriesBulk) {
      const wallet = "0x" + "a".repeat(40);
      const res = await adapter.addWatchlistEntriesBulk([
        {
          walletAddress: wallet,
          identityKey: "evm:1:0x123",
          tokenAddress: "0x123",
          chain: "ethereum",
          symbol: "WETH",
          name: "Wrapped Ether",
          createdAt: new Date().toISOString(),
        },
      ]);
      if (!res.added || res.added.length === 0) {
        throw new Error("addWatchlistEntriesBulk failed to add entry");
      }
    }
  });

  // 16. Retention & Erasure: storeErasureReceipt and getErasureReceipt
  await executeTest("erasure: store and retrieve erasure receipt", async () => {
    if (adapter.storeErasureReceipt && adapter.getErasureReceipt) {
      const receiptId = "rcpt_" + Date.now();
      const receipt = {
        receiptId,
        walletHash: "hash_" + Date.now(),
        chainFamily: "evm" as const,
        network: "ethereum-mainnet",
        erasedAt: new Date().toISOString(),
        sha256: "sha_" + Date.now(),
        receiptBody: JSON.stringify({ ok: true }),
        createdAt: new Date().toISOString(),
      };
      await adapter.storeErasureReceipt(receipt);
      const retrieved = await adapter.getErasureReceipt(receiptId);
      if (!retrieved || retrieved.receiptId !== receiptId) {
        throw new Error("getErasureReceipt failed to return stored receipt");
      }
    }
  });

  // 17. Retention & Erasure: eraseWalletData and residueCheck
  await executeTest("erasure: eraseWalletData and residueCheck lifecycle", async () => {
    if (adapter.eraseWalletData && adapter.residueCheck) {
      const wallet = "0x" + "b".repeat(40);
      await adapter.createTransactionRecord({
        hash: "0x" + "e1".padEnd(64, "0"),
        type: "transfer",
        asset: "ETH",
        valueUsd: 10,
        status: "pending",
        lifecycleStatus: "pending",
        chainFamily: "evm",
        walletAddress: wallet,
        network: "ethereum-mainnet",
        createdAt: new Date().toISOString(),
      });

      const erasureResult = await adapter.eraseWalletData(wallet, "evm", "ethereum-mainnet");
      if (!erasureResult.tables || erasureResult.tables.length === 0) {
        throw new Error("eraseWalletData returned no table operations");
      }

      const residue = await adapter.residueCheck(wallet, "evm", "ethereum-mainnet");
      if (residue.leaks.length > 0) {
        throw new Error(`residueCheck found leaks after erasure: ${JSON.stringify(residue.leaks)}`);
      }
    }
  });

  // 18. Concurrent Writes
  await executeTest("concurrency: multiple parallel writes do not corrupt storage", async () => {
    const wallet = "0x" + "c".repeat(40);
    const writes = Array.from({ length: 5 }, (_, i) => {
      const hash = "0x" + i.toString(16).padStart(2, "0") + "f".repeat(62);
      return adapter.createTransactionRecord({
        hash,
        type: "transfer",
        asset: "ETH",
        valueUsd: i * 10,
        status: "pending",
        lifecycleStatus: "pending",
        chainFamily: "evm",
        walletAddress: wallet,
        network: "ethereum-mainnet",
        createdAt: new Date(Date.now() + i * 1000).toISOString(),
      });
    });

    await Promise.all(writes);
    const list = await adapter.listTransactionRecords(wallet);
    if (list.length < 5) {
      throw new Error(`Expected at least 5 transactions from concurrent writes, got ${list.length}`);
    }
  });

  const passedTests = results.filter((r) => r.passed).length;
  const failedTests = results.filter((r) => !r.passed).length;

  const report: ConformanceReport = {
    adapterProvider: adapter.provider,
    totalTests: results.length,
    passedTests,
    failedTests,
    results,
  };

  if (failedTests > 0) {
    const failureList = results.filter((r) => !r.passed);
    throw new ConformanceSuiteError(
      `Conformance suite failed for adapter [${adapter.provider}]: ${failedTests} of ${results.length} tests failed`,
      failureList
    );
  }

  return report;
}
