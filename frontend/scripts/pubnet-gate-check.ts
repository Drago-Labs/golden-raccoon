import assert from "node:assert/strict";

import { providerIdentity } from "../src/server/stellar/checks/rpcIndependence";
import { checkRpcIndependence } from "../src/server/stellar/checks/rpcIndependence";
import { checkPaymentConfig } from "../src/server/stellar/checks/paymentConfig";
import { checkGovernanceAddresses } from "../src/server/stellar/checks/governanceAddresses";
import { checkContractIdentity } from "../src/server/stellar/checks/contractIdentity";
import { evaluatePubnetReadiness, PubnetGatedError, assertPubnetAllowed } from "../src/server/stellar/pubnetGate";
import type { ApprovedPubnetConfig } from "../src/server/stellar/config";

/**
 * Drives the pubnet readiness gate through a deliberately misconfigured
 * environment for each condition in turn, and asserts a specific, actionable
 * failure every time.
 *
 * The point is not that the gate can pass; it is that the gate cannot be made
 * to pass by accident. Every case below is a real deployment mistake.
 */

const APPROVED_REGISTRY = "CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const APPROVED_POLICY = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const APPROVED_PAY_TO = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const APPROVED_USDC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
const APPROVED_FACILITATOR = "https://facilitator.example";
const APPROVED_WASM = "a".repeat(64);

function approved(overrides: Partial<ApprovedPubnetConfig> = {}): ApprovedPubnetConfig {
  return {
    registryWasmHash: APPROVED_WASM,
    registryContractId: APPROVED_REGISTRY,
    policyContractId: APPROVED_POLICY,
    x402PayTo: APPROVED_PAY_TO,
    x402UsdcContract: APPROVED_USDC,
    x402FacilitatorOrigin: APPROVED_FACILITATOR,
    rpcLedgerTolerance: 5,
    ...overrides,
  };
}

function runtime(overrides: Record<string, unknown> = {}) {
  return {
    network: "stellar:pubnet",
    payTo: APPROVED_PAY_TO,
    stellarPubnetUsdcContract: APPROVED_USDC,
    facilitatorUrl: `${APPROVED_FACILITATOR}/settle`,
    ...overrides,
  } as never;
}

async function main() {
  // ---------------------------------------------------------------- providers

  assert.equal(providerIdentity("https://a.example.com/rpc"), "example.com");
  assert.equal(
    providerIdentity("https://b.example.com"),
    providerIdentity("https://a.example.com"),
    "Sub-domains of one operator must not count as independent providers",
  );
  assert.equal(providerIdentity("not a url"), null);

  const unreachable = await checkRpcIndependence(async () => null, approved());
  assert.equal(unreachable.status, "fail");
  assert.ok(
    ["rpc_provider_unreachable", "rpc_providers_dependent", "rpc_providers_insufficient"].includes(
      unreachable.reason as string,
    ),
    `Unreachable providers must block pubnet, got ${unreachable.reason}`,
  );

  let ledger = 1_000_000;
  const drifting = await checkRpcIndependence(async () => (ledger += 1_000), approved());
  assert.equal(drifting.status, "fail");
  assert.ok(
    ["rpc_ledger_disagreement", "rpc_providers_dependent"].includes(drifting.reason as string),
    `Disagreeing providers must block pubnet, got ${drifting.reason}`,
  );

  // ------------------------------------------------------------------ payment

  assert.equal(
    checkPaymentConfig(approved({ x402PayTo: undefined })).reason,
    "approved_config_missing",
    "An unreviewed payment address must block pubnet rather than be assumed correct",
  );

  assert.equal(
    checkPaymentConfig(approved(), runtime({ network: "stellar:testnet" })).reason,
    "payment_network_mismatch",
    "A testnet-shaped payment configuration must never be advertised as pubnet",
  );

  assert.equal(
    checkPaymentConfig(approved(), runtime({ payTo: "not-an-address" })).reason,
    "payment_address_invalid",
  );

  assert.equal(
    checkPaymentConfig(
      approved(),
      runtime({ payTo: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H" }),
    ).reason,
    "payment_address_unapproved",
    "A valid but unreviewed destination must block pubnet",
  );

  assert.equal(
    checkPaymentConfig(approved(), runtime({ stellarPubnetUsdcContract: APPROVED_REGISTRY })).reason,
    "usdc_contract_unapproved",
  );

  assert.equal(
    checkPaymentConfig(approved(), runtime({ facilitatorUrl: "http://facilitator.example" })).reason,
    "facilitator_unapproved",
    "A plaintext facilitator must block pubnet",
  );

  assert.equal(
    checkPaymentConfig(approved(), runtime({ facilitatorUrl: "https://someone-else.example" })).reason,
    "facilitator_unapproved",
  );

  assert.equal(checkPaymentConfig(approved(), runtime()).status, "pass");

  // ----------------------------------------------------------------- identity

  const unverifiedHash = await checkContractIdentity(async () => null, approved());
  assert.equal(unverifiedHash.status, "fail");
  assert.ok(
    ["wasm_hash_unverified", "registry_contract_missing", "registry_contract_invalid"].includes(
      unverifiedHash.reason as string,
    ),
    `An unreadable WASM hash must block pubnet, got ${unverifiedHash.reason}`,
  );

  const noApprovedHash = await checkContractIdentity(
    async () => APPROVED_WASM,
    approved({ registryWasmHash: undefined }),
  );
  assert.equal(noApprovedHash.status, "fail");

  // --------------------------------------------------------------- governance

  assert.equal(
    checkGovernanceAddresses(approved({ policyContractId: undefined })).reason,
    "approved_config_missing",
  );

  const wrongPolicy = checkGovernanceAddresses(approved());
  assert.equal(wrongPolicy.status, "fail", "An unconfigured policy contract must block pubnet");

  // ---------------------------------------------------------------- fail shut

  const readiness = await evaluatePubnetReadiness({
    readWasmHash: async () => APPROVED_WASM,
    readLedger: async () => 1_000_000,
  });

  assert.equal(
    readiness.ready,
    false,
    "Pubnet must not be ready in an environment that was never reviewed",
  );

  if (readiness.requested) {
    assert.ok(readiness.blockedBy, "A gated deployment must name the blocking reason");
    assert.ok(
      readiness.checks.every((check) => check.detail.length > 20),
      "Every check must explain itself in operator-facing terms",
    );
  } else {
    assert.deepEqual(readiness.checks, [], "Testnet deployments must run no pubnet checks");
  }

  await assert.rejects(
    () => assertPubnetAllowed({ readWasmHash: async () => null, readLedger: async () => null }),
    (error: unknown) => {
      assert.ok(error instanceof PubnetGatedError, "Refusals must be typed");
      assert.ok((error as PubnetGatedError).reason, "Refusals must carry a reason");
      return true;
    },
    "A pubnet action must be refused while the gate is closed",
  );

  console.log("Pubnet readiness gate checks passed.");
}

void main();
