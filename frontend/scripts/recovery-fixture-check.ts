import {
  applyRecoveryToExecutionPreview,
  applyStaleIfExpired,
  assertPrepareAllowedByRecovery,
  buildRecoveryRequestFromInput,
  createRecoveryRequest,
  findActiveRecovery,
  getIncidentMode,
  getPolicyVersion,
  getRecoveryConsequences,
  getRecoveryCounts,
  getRecoveryList,
  getRecoveryRequest,
  getRecoveryStateSummary,
  listRecoveryRequests,
  markRecoveryConfirmed,
  markRecoveryFailed,
  markRecoverySubmitted,
  resetRecoveryStoreForTests,
  setIncidentMode,
} from "../src/server/recovery";
import {
  POST as prepareExecute,
} from "../src/app/api/execute/prepare/route";
import type { TransactionPreview } from "../src/server/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertThrows(fn: () => void, message: string) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(message);
}

function postPrepare(body: unknown) {
  return prepareExecute(
    new Request("http://localhost/api/execute/prepare", {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
      headers: { "content-type": "application/json" },
    }),
  );
}

async function runPolicyChecks() {
  resetRecoveryStoreForTests();
  setIncidentMode(false, { updatedBy: "fixture-admin" });
  assert(getPolicyVersion() === "v3.0.0", "Recovery rules must carry an explicit version label.");

  const trustlineConsequences = getRecoveryConsequences({
    recoveryType: "remove_trustline",
    chainFamily: "stellar",
    asset: "USDC:GA5ZSEJYB37JRC52ZUKXA55PUYDQNYKZJZ7HV3WD",
    stellarReserveXlm: "0.5",
    stellarExpectedFeeXlm: "0.00001",
    issuerRevocable: true,
    issuerClawback: false,
  });
  assert(trustlineConsequences.some((text) => text.includes("0.5 XLM")), "Trustline consequences must surface reserve amount.");
  assert(trustlineConsequences.some((text) => text.toLowerCase().includes("issuer")), "Trustline consequences must surface issuer control flags.");
  assert(trustlineConsequences.some((text) => text.includes("0.00001 XLM")), "Trustline consequences must surface expected fee.");

  const revokeConsequences = getRecoveryConsequences({
    recoveryType: "revoke_allowance",
    chainFamily: "evm",
    asset: "0xUSDC",
    consumer: "0xSpender",
    isInfiniteApproval: true,
    evmExpectedFeeUsd: "0.40",
  });
  assert(revokeConsequences.some((text) => text.toLowerCase().includes("infinite")), "Revoke consequences must surface the infinite approval warning.");
  assert(revokeConsequences.some((text) => text.includes("0.40 USD")), "Revoke consequences must surface the expected network fee.");
}

async function runStoreChecks() {
  resetRecoveryStoreForTests();

  const pause = createRecoveryRequest({
    walletAddress: "0xabc",
    recoveryType: "pause_agent",
    chainFamily: "evm",
    status: "prepared",
    incidentMode: false,
    consequences: getRecoveryConsequences({ recoveryType: "pause_agent", chainFamily: "evm" }),
    policyVersion: getPolicyVersion(),
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    preparedAt: new Date().toISOString(),
  });
  assert(pause.status === "prepared", "Pause recovery must default to prepared status.");
  assert(findActiveRecovery("0xabc", "pause_agent")?.id === pause.id, "Pause recovery must be discoverable as an active request.");
  assert(getRecoveryRequest(pause.id)?.id === pause.id, "Pause recovery must be retrievable by id.");

  const duplicatePause = createRecoveryRequest({
    walletAddress: "0xabc",
    recoveryType: "pause_agent",
    chainFamily: "evm",
    status: "prepared",
    incidentMode: false,
    consequences: ["dup"],
    policyVersion: getPolicyVersion(),
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    preparedAt: new Date().toISOString(),
  });
  assert(duplicatePause.id === pause.id, "Duplicate pause requests must dedupe to the existing record.");

  const revoke = createRecoveryRequest({
    walletAddress: "0xabc",
    recoveryType: "revoke_agent",
    chainFamily: "any",
    status: "prepared",
    incidentMode: false,
    consequences: getRecoveryConsequences({ recoveryType: "revoke_agent", chainFamily: "any" }),
    policyVersion: getPolicyVersion(),
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    preparedAt: new Date().toISOString(),
  });
  assert(revoke.id !== pause.id, "Different recovery types must produce distinct records.");

  const allowance = createRecoveryRequest({
    walletAddress: "0xabc",
    recoveryType: "revoke_allowance",
    chainFamily: "evm",
    asset: "0xUSDC",
    consumer: "0xSpender",
    amount: "0",
    status: "prepared",
    incidentMode: false,
    consequences: getRecoveryConsequences({
      recoveryType: "revoke_allowance",
      chainFamily: "evm",
      asset: "0xUSDC",
      consumer: "0xSpender",
      isInfiniteApproval: true,
    }),
    lastVerifiedBlockNumber: 1234567,
    policyVersion: getPolicyVersion(),
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    preparedAt: new Date().toISOString(),
  });
  assert(allowance.lastVerifiedBlockNumber === 1234567, "Allowance record must preserve lastVerifiedBlockNumber.");

  const trustline = createRecoveryRequest({
    walletAddress: "GABC",
    recoveryType: "remove_trustline",
    chainFamily: "stellar",
    asset: "USDC:GA5ZSEJYB37JRC52ZUKXA55PUYDQNYKZJZ7HV3WD",
    status: "prepared",
    incidentMode: false,
    consequences: getRecoveryConsequences({
      recoveryType: "remove_trustline",
      chainFamily: "stellar",
      asset: "USDC:GA5ZSEJYB37JRC52ZUKXA55PUYDQNYKZJZ7HV3WD",
      stellarReserveXlm: "0.5",
    }),
    lastVerifiedLedger: 98765,
    reservedNativeAmount: "0.5",
    expectedFee: "0.00001",
    policyVersion: getPolicyVersion(),
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    preparedAt: new Date().toISOString(),
  });
  assert(trustline.lastVerifiedLedger === 98765, "Trustline record must preserve lastVerifiedLedger.");
  assert(trustline.consequences.some((line) => line.includes("0.5 XLM")), "Trustline record must preserve reserve consequences.");

  markRecoverySubmitted(allowance.id, "0x" + "a".repeat(64));
  markRecoveryConfirmed(allowance.id, "0x" + "a".repeat(64));
  const confirmed = getRecoveryRequest(allowance.id);
  assert(confirmed?.status === "confirmed", "Allowance record must be marked confirmed after tx hash submit.");
  assert(confirmed?.confirmedAt !== undefined, "Confirmed record must expose confirmedAt.");

  markRecoveryFailed(trustline.id, "simulated wallet-mismatch");
  assert(getRecoveryRequest(trustline.id)?.status === "failed", "Failed record must remain accessible for audit.");

  const stale = createRecoveryRequest({
    walletAddress: "0xdef",
    recoveryType: "pause_agent",
    chainFamily: "evm",
    status: "prepared",
    incidentMode: false,
    consequences: ["stale fixture"],
    policyVersion: getPolicyVersion(),
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    preparedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
  });
  const staleView = applyStaleIfExpired(stale);
  assert(staleView.status === "stale", "Records older than the freshness window must transition to stale.");
  assert(staleView.staleAt !== undefined, "Stale records must carry a staleAt timestamp.");
  assert(listRecoveryRequests("0xdef").some((record) => record.id === stale.id && record.status === "stale"), "listRecoveryRequests must surface stale records.");

  const summary = getRecoveryStateSummary("0xabc");
  assert(summary.infiniteApprovalWarnings.length === 1, "State summary must surface detected infinite approval warnings.");
  assert(summary.revokedAgents.includes("execution"), "State summary must surface revoked execution agent.");
  assert(summary.recent.length >= 1, "State summary must show recent recoveries.");

  const list = getRecoveryList("0xabc");
  assert(list.policyVersion === getPolicyVersion(), "Recovery list must surface policy version.");
  assert(list.lastVerifiedBlockNumber === 1234567, "Recovery list must surface highest known blockNumber.");
  assert(list.staleCount === 0, "0xabc must not contain stale records.");

  const counts = getRecoveryCounts();
  assert(counts.confirmed >= 1, "Recovery counts must include confirmed records.");
  assert(counts.failed >= 1, "Recovery counts must include failed records.");
}

async function runIncidentModeChecks() {
  resetRecoveryStoreForTests();
  setIncidentMode(true, { reason: "incident fixture", updatedBy: "fixture-admin" });
  assert(getIncidentMode().enabled === true, "Incident mode must enable when set true.");
  assertThrows(() => assertPrepareAllowedByRecovery(), "Prepare must be blocked while incident mode is active.");

  const blockedResponse = await postPrepare({
    walletAddress: "0xabc",
    action: "reduce_exposure",
    percent: 10,
    riskScore: 30,
    estimatedValueUsd: 100,
    network: "GOAT Network",
    simulationStatus: "passed",
  });
  assert(blockedResponse.status === 423, "Execute prepare must return HTTP 423 when incident mode is active.");

  // Re-arming incident=false must allow prepare again.
  setIncidentMode(false, { reason: "incident cleared", updatedBy: "fixture-admin" });
  assertPrepareAllowedByRecovery();

  const okResponse = await postPrepare({
    walletAddress: "0xabc",
    action: "reduce_exposure",
    percent: 10,
    riskScore: 30,
    estimatedValueUsd: 100,
    network: "GOAT Network",
    simulationStatus: "passed",
  });
  assert(okResponse.status === 200, "Execute prepare must pass once incident mode is cleared.");
}

async function runWalletNetworkChecks() {
  resetRecoveryStoreForTests();

  const helper = buildRecoveryRequestFromInput({
    walletAddress: "0xabc",
    recoveryType: "revoke_allowance",
    asset: "0xUSDC",
    consumer: "0xSpender",
    chainFamily: "evm",
    txHash: "0x" + "c".repeat(64),
    status: "submitted",
    consequences: getRecoveryConsequences({ recoveryType: "revoke_allowance", chainFamily: "evm", asset: "0xUSDC", consumer: "0xSpender" }),
  });
  assert(helper.txHash === "0x" + "c".repeat(64), "buildRecoveryRequestFromInput must surface tx hash.");

  // Recover state must attach to a TransactionPreview without breaking it.
  const basePreview: TransactionPreview = {
    title: "Reduce exposure preview",
    estimatedValueUsd: 100,
    currentRiskScore: 30,
    projectedRiskScore: 30,
    requiresApproval: false,
    network: "GOAT Network",
  };

  const previewWithRecovery = applyRecoveryToExecutionPreview(basePreview, { walletAddress: "0xabc" });
  assert(typeof previewWithRecovery.policy?.policyVersion === "string", "Preview must carry recovery policyVersion.");
  assert(previewWithRecovery.policy?.recoveryState !== undefined, "Preview must surface recoveryState section.");
}

async function main() {
  await runPolicyChecks();
  await runStoreChecks();
  await runIncidentModeChecks();
  await runWalletNetworkChecks();
  console.log("Recovery fixture checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
