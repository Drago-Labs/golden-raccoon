import assert from "node:assert/strict";
import {
  mintNonce,
  verifyAndConsumeNonce,
  resetNonceStore,
} from "../src/server/security/nonce";
import {
  createSession,
  getSession,
  rotateSession,
  validateSessionGeneration,
  revokeSession,
  revokeAllSessionsForWallet,
  exportSessionsForWallet,
  resetSessionRegistry,
  extractDeviceBinding,
  hashSessionId,
} from "../src/server/security/session";
import {
  encodeWalletCookie,
  resolveWalletSession,
  WALLET_SESSION_COOKIE,
} from "../src/server/security/walletSession";
import { exportWalletData, deleteWalletData } from "../src/server/storage";
import { NextRequest } from "next/server";

/**
 * Validates that nonces cannot be replayed, used across addresses, or used after expiry.
 */
async function testNonceIntegrity() {
  resetNonceStore();
  const evmWallet = "0x1234567890123456789012345678901234567890";
  const nonceRecord = mintNonce({
    walletAddress: evmWallet,
    family: "evm",
    ttlSeconds: 100,
  });

  const mismatch = verifyAndConsumeNonce({
    nonce: nonceRecord.nonce,
    walletAddress: "0x9999999999999999999999999999999999999999",
    family: "evm",
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.status, "address_mismatch");

  const success = verifyAndConsumeNonce({
    nonce: nonceRecord.nonce,
    walletAddress: evmWallet,
    family: "evm",
  });
  assert.equal(success.ok, true);

  const replayed = verifyAndConsumeNonce({
    nonce: nonceRecord.nonce,
    walletAddress: evmWallet,
    family: "evm",
  });
  assert.equal(replayed.ok, false);
  assert.equal(replayed.status, "already_used");

  const expiredRecord = mintNonce({
    walletAddress: evmWallet,
    family: "evm",
    ttlSeconds: -10,
  });
  const expiredAttempt = verifyAndConsumeNonce({
    nonce: expiredRecord.nonce,
    walletAddress: evmWallet,
    family: "evm",
  });
  assert.equal(expiredAttempt.ok, false);
  assert.equal(expiredAttempt.status, "expired");
}

/**
 * Validates session rotation, generation tracking, and overlap window behavior.
 */
async function testRotationAndOverlap() {
  resetSessionRegistry();
  const wallet = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const session = createSession({
    walletAddress: wallet,
    family: "evm",
    deviceBindingHash: "device_hash_1",
    deviceHint: "Desktop / Chrome",
  });

  assert.equal(session.generation, 1);

  const rotated = rotateSession(session.sessionId, 50);
  assert(rotated);
  assert.equal(rotated.newGeneration, 2);
  assert.equal(rotated.previousGeneration, 1);

  const active = getSession(session.sessionId);
  assert(active);
  assert.equal(active.generation, 2);

  const currentCheck = validateSessionGeneration(active, 2);
  assert.equal(currentCheck.valid, true);
  assert.equal(currentCheck.reason, "current");

  const overlapCheck = validateSessionGeneration(active, 1);
  assert.equal(overlapCheck.valid, true);
  assert.equal(overlapCheck.isOverlap, true);
  assert.equal(overlapCheck.reason, "overlap");

  await new Promise((resolve) => setTimeout(resolve, 60));
  const expiredOverlapCheck = validateSessionGeneration(active, 1);
  assert.equal(expiredOverlapCheck.valid, false);
  assert.equal(expiredOverlapCheck.reason, "superseded_expired");
}

/**
 * Validates immediate revocation of single and all wallet sessions.
 */
async function testSessionRevocation() {
  resetSessionRegistry();
  const wallet = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const s1 = createSession({ walletAddress: wallet, family: "evm" });
  const s2 = createSession({ walletAddress: wallet, family: "evm" });

  assert.equal(getSession(s1.sessionId)?.status, "active");
  const revoked = revokeSession(s1.sessionId, "logout");
  assert.equal(revoked, true);
  assert.equal(getSession(s1.sessionId)?.status, "revoked");

  assert.equal(getSession(s2.sessionId)?.status, "active");
  const count = revokeAllSessionsForWallet(wallet, "bulk_revocation");
  assert.equal(count, 1);
  assert.equal(getSession(s2.sessionId)?.status, "revoked");
}

/**
 * Validates device binding mismatch refusal and typed error response.
 */
async function testDeviceBindingEnforcement() {
  process.env.ALLOW_WALLET_SESSION_COOKIE = "1";
  process.env.WALLET_SESSION_COOKIE_SECRET = "0123456789abcdef0123456789abcdef";

  resetSessionRegistry();
  const wallet = "0xcccccccccccccccccccccccccccccccccccccccc";

  const originalReq = new NextRequest("http://localhost/api/alert-rules", {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      "accept-language": "en-US,en;q=0.9",
    },
  });
  const originalBinding = extractDeviceBinding(originalReq);

  const session = createSession({
    walletAddress: wallet,
    family: "evm",
    deviceBindingHash: originalBinding.bindingHash,
    deviceHint: originalBinding.deviceHint,
  });

  const cookieVal = encodeWalletCookie(wallet, {
    sessionId: session.sessionId,
    generation: 1,
  });

  const validReq = new NextRequest("http://localhost/api/alert-rules", {
    headers: {
      cookie: `${WALLET_SESSION_COOKIE}=${cookieVal}`,
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      "accept-language": "en-US,en;q=0.9",
    },
  });
  const validRes = resolveWalletSession(validReq);
  assert.equal(validRes.response, undefined);
  assert.equal(validRes.wallet, wallet);

  const attackerReq = new NextRequest("http://localhost/api/alert-rules", {
    headers: {
      cookie: `${WALLET_SESSION_COOKIE}=${cookieVal}`,
      "user-agent": "Linux / Python Requests",
      "accept-language": "ru-RU",
    },
  });
  const attackerRes = resolveWalletSession(attackerReq);
  assert(attackerRes.response);
  assert.equal(attackerRes.response.status, 401);
  const errorJson = await attackerRes.response.json();
  assert.equal(errorJson.code, "device_binding_mismatch");
}

/**
 * Validates privacy export inclusion and privacy deletion revocation/erasure.
 */
async function testPrivacyIntegration() {
  resetSessionRegistry();
  const wallet = "0xdddddddddddddddddddddddddddddddddddddddd";
  const session = createSession({ walletAddress: wallet, family: "evm" });

  const exported = await exportWalletData(wallet);
  assert(exported.memoryData.sessions);
  assert.equal(exported.memoryData.sessions.length, 1);
  assert.equal(exported.memoryData.sessions[0].sessionIdHash, hashSessionId(session.sessionId));
  assert.equal("sessionId" in exported.memoryData.sessions[0], false);
  assert.equal("deviceBindingHash" in exported.memoryData.sessions[0], false);

  const deleted = await deleteWalletData(wallet);
  assert.equal(deleted.ok, true);
  assert.equal(getSession(session.sessionId), undefined);
  const reExported = await exportWalletData(wallet);
  assert.equal(reExported.memoryData.sessions.length, 0);
}

/**
 * Main test runner executing all session security checks.
 */
async function run() {
  console.log("Starting Session Security & Architecture Validation...");
  await testNonceIntegrity();
  console.log("  PASS testNonceIntegrity");
  await testRotationAndOverlap();
  console.log("  PASS testRotationAndOverlap");
  await testSessionRevocation();
  console.log("  PASS testSessionRevocation");
  await testDeviceBindingEnforcement();
  console.log("  PASS testDeviceBindingEnforcement");
  await testPrivacyIntegration();
  console.log("  PASS testPrivacyIntegration");
  console.log("\nALL 8 ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY!");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
