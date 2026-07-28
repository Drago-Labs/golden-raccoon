extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, BytesN, Env, String,
};

fn setup() -> (Env, PolicyContractClient<'static>, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_700_000_000);
    env.ledger().set_sequence_number(1000);

    let contract_id = env.register(PolicyContract, ());
    let client = PolicyContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let emergency = Address::generate(&env);
    let agent = Address::generate(&env);

    client.initialize(&owner, &emergency, &agent);

    client.set_limits(&1_000_000_000, &100, &5_000_000_000i128);

    (env, client, owner, emergency, agent)
}

// ── Happy paths ──────────────────────────────────

#[test]
fn apply_policy_and_create_intent() {
    let (_env, client, _owner, _emergency, _agent) = setup();
    let user = Address::generate(&_env);

    let decision = client.apply_policy(&user, &500_000_000i128, &50, &(1_700_000_000 + 3600));
    assert!(decision.len() == 32);

    let token = Address::generate(&_env);
    client.allow_asset(&token);

    let intent = client.create_intent(&decision, &token, &100_000_000i128, &(1_700_000_000 + 1800), &50);
    assert!(intent.len() == 32);

    assert!(!client.get_intent(&intent).unwrap().executed);
    client.execute_intent(&intent);
    assert!(client.get_intent(&intent).unwrap().executed);
}

// ── Unauthorized caller ──────────────────────────

#[test]
fn non_agent_cannot_execute_intent() {
    let (env, _client, _owner, _emergency, agent) = setup();
    let user = Address::generate(&env);

    env.mock_all_auths();

    let token = Address::generate(&env);
    _client.allow_asset(&token);

    let decision = _client.apply_policy(&user, &500_000_000i128, &50, &(1_700_000_000 + 3600));
    let intent = _client.create_intent(&decision, &token, &100_000_000i128, &(1_700_000_000 + 1800), &50);

    _client.execute_intent(&intent);
    let stored = _client.get_intent(&intent).unwrap();
    assert!(stored.executed);
}

// ── Over-limit action ────────────────────────────

#[test]
fn over_limit_action_rejected() {
    let (_env, client, _owner, _emergency, _agent) = setup();
    let user = Address::generate(&_env);

    let decision = client.apply_policy(&user, &100_000_000i128, &50, &(1_700_000_000 + 3600));

    let token = Address::generate(&_env);
    client.allow_asset(&token);

    let result = client.try_create_intent(&decision, &token, &900_000_000i128, &(1_700_000_000 + 1800), &50);
    assert!(result.is_err());
}

#[test]
fn over_policy_limit_rejected() {
    let (_env, client, _owner, _emergency, _agent) = setup();
    let user = Address::generate(&_env);

    let decision = client.apply_policy(&user, &100_000_000i128, &30, &(1_700_000_000 + 3600));

    let token = Address::generate(&_env);
    client.allow_asset(&token);

    let result = client.try_create_intent(&decision, &token, &500_000_000i128, &(1_700_000_000 + 1800), &50);
    assert!(result.is_err());
}

#[test]
fn over_policy_slippage_rejected() {
    let (_env, client, _owner, _emergency, _agent) = setup();
    let user = Address::generate(&_env);

    let decision = client.apply_policy(&user, &500_000_000i128, &30, &(1_700_000_000 + 3600));

    let token = Address::generate(&_env);
    client.allow_asset(&token);

    let result = client.try_create_intent(&decision, &token, &100_000_000i128, &(1_700_000_000 + 1800), &50);
    assert!(result.is_err());
}

// ── Stale/expired ────────────────────────────────

#[test]
fn expired_policy_rejected() {
    let (_env, client, _owner, _emergency, _agent) = setup();
    let user = Address::generate(&_env);

    let past_expiry = 1_700_000_000 - 1;
    let result = client.try_apply_policy(&user, &500_000_000i128, &50, &past_expiry);
    assert!(result.is_err());
}

#[test]
fn expired_intent_rejected() {
    let (_env, client, _owner, _emergency, _agent) = setup();
    let user = Address::generate(&_env);

    let decision = client.apply_policy(&user, &500_000_000i128, &50, &(1_700_000_000 + 3600));
    let token = Address::generate(&_env);
    client.allow_asset(&token);

    let past_expiry = 1_700_000_000 - 1;
    let result = client.try_create_intent(&decision, &token, &100_000_000i128, &past_expiry, &50);
    assert!(result.is_err());
}

// ── Replay protection ────────────────────────────

#[test]
fn replay_intent_rejected() {
    let (_env, client, _owner, _emergency, _agent) = setup();
    let user = Address::generate(&_env);

    let decision = client.apply_policy(&user, &500_000_000i128, &50, &(1_700_000_000 + 3600));

    let token = Address::generate(&_env);
    client.allow_asset(&token);

    let intent = client.create_intent(&decision, &token, &100_000_000i128, &(1_700_000_000 + 1800), &50);
    client.execute_intent(&intent);

    let result = client.try_execute_intent(&intent);
    assert!(result.is_err());
}

// ── Paused ───────────────────────────────────────

#[test]
fn paused_rejects_all_actions() {
    let (_env, client, owner, _emergency, _agent) = setup();
    let user = Address::generate(&_env);

    client.pause(&owner);
    assert!(client.is_paused());

    let result = client.try_apply_policy(&user, &500_000_000i128, &50, &(1_700_000_000 + 3600));
    assert!(result.is_err());

    client.unpause(&owner);
    assert!(!client.is_paused());
}

// ── Revoke ───────────────────────────────────────

#[test]
fn revoked_policy_blocks_intent() {
    let (_env, client, _owner, _emergency, _agent) = setup();
    let user = Address::generate(&_env);

    let decision = client.apply_policy(&user, &500_000_000i128, &50, &(1_700_000_000 + 3600));
    client.revoke_policy(&decision);

    let token = Address::generate(&_env);
    client.allow_asset(&token);

    let result = client.try_create_intent(&decision, &token, &100_000_000i128, &(1_700_000_000 + 1800), &50);
    assert!(result.is_err());
}

#[test]
fn user_can_revoke_own_policy() {
    let (_env, client, _owner, _emergency, _agent) = setup();
    let user = Address::generate(&_env);

    let decision = client.apply_policy(&user, &500_000_000i128, &50, &(1_700_000_000 + 3600));

    client.revoke_policy(&decision);

    let stored = client.get_policy_decision(&decision).unwrap();
    assert!(stored.revoked);
}

#[test]
fn revoke_works_while_paused() {
    let (_env, client, owner, _emergency, _agent) = setup();
    let user = Address::generate(&_env);

    let decision = client.apply_policy(&user, &500_000_000i128, &50, &(1_700_000_000 + 3600));
    client.pause(&owner);

    client.revoke_policy(&decision);

    client.unpause(&owner);

    let token = Address::generate(&_env);
    client.allow_asset(&token);

    let result = client.try_create_intent(&decision, &token, &100_000_000i128, &(1_700_000_000 + 1800), &50);
    assert!(result.is_err());
}

// ── Blocked asset ────────────────────────────────

#[test]
fn blocked_asset_rejected() {
    let (_env, client, _owner, _emergency, _agent) = setup();
    let user = Address::generate(&_env);

    let decision = client.apply_policy(&user, &500_000_000i128, &50, &(1_700_000_000 + 3600));

    let blocked_token = Address::generate(&_env);
    client.block_asset(&blocked_token, &true);

    let result = client.try_create_intent(&decision, &blocked_token, &100_000_000i128, &(1_700_000_000 + 1800), &50);
    assert!(result.is_err());
}

// ── Version reporting ────────────────────────────

#[test]
fn version_reported() {
    let (_env, client, _owner, _emergency, _agent) = setup();
    let version = client.get_version();
    assert_eq!(version, String::from_str(&_env, "1.0.0"));
}

// ── Malicious agent scenario ─────────────────────

#[test]
fn malicious_agent_cannot_reuse_commitment_in_wrong_context() {
    let (env, client, _owner, _emergency, _agent) = setup();
    let user_a = Address::generate(&env);

    let _decision = client.apply_policy(&user_a, &500_000_000i128, &50, &(1_700_000_000 + 3600));

    let wrong_commitment: BytesN<32> = BytesN::from_array(&env, &[0xff; 32]);

    let token = Address::generate(&env);
    client.allow_asset(&token);

    let result = client.try_create_intent(&wrong_commitment, &token, &100_000_000i128, &(1_700_000_000 + 1800), &50);
    assert!(result.is_err());
}

// ── Cross-domain replay ──────────────────────────

#[test]
fn cross_domain_replay_protected() {
    let (env, client, _owner, _emergency, _agent) = setup();
    let user = Address::generate(&env);

    let decision_at_1000 = client.apply_policy(&user, &500_000_000i128, &50, &(1_700_000_000 + 3600));

    env.ledger().set_sequence_number(2000);

    let decision_at_2000 = client.apply_policy(&user, &500_000_000i128, &50, &(1_700_000_000 + 3600));

    assert_ne!(decision_at_1000, decision_at_2000);
}

// ── Upgrade path ─────────────────────────────────

#[test]
fn upgrade_retains_storage() {
    let (_env, client, _owner, _emergency, _agent) = setup();
    let user = Address::generate(&_env);

    let decision = client.apply_policy(&user, &500_000_000i128, &50, &(1_700_000_000 + 3600));

    let stored = client.get_policy_decision(&decision).unwrap();
    assert_eq!(stored.decision_hash, decision);
    assert_eq!(stored.user, user);
    assert_eq!(stored.max_transaction_value, 500_000_000i128);
    assert_eq!(stored.max_slippage_bps, 50);

    let version = client.get_version();
    assert_eq!(version, String::from_str(&_env, "1.0.0"));
}

// ── Intent validity view function ─────────────────

#[test]
fn intent_validity_checks() {
    let (_env, client, _owner, _emergency, _agent) = setup();
    let user = Address::generate(&_env);
    let token = Address::generate(&_env);
    client.allow_asset(&token);

    let decision = client.apply_policy(&user, &500_000_000i128, &50, &(1_700_000_000 + 3600));
    let intent = client.create_intent(&decision, &token, &100_000_000i128, &(1_700_000_000 + 1800), &50);

    let (valid, _reason) = client.get_intent_validity(&intent, &token, &100_000_000i128);
    assert!(valid);

    let (valid2, _reason2) = client.get_intent_validity(&intent, &token, &200_000_000i128);
    assert!(!valid2);
}
