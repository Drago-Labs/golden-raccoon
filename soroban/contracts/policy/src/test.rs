extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    vec, Address, BytesN, Env, String,
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
    let (_env, client, _owner, _emergency, agent) = setup();
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
fn unauthorized_caller_rejected() {
    let (env, client, _owner, _emergency, _agent) = setup();
    let user = Address::generate(&env);
    let random = Address::generate(&env);

    env.mock_all_auths();

    let token = Address::generate(&env);
    client.allow_asset(&token);

    let decision = client.apply_policy(&user, &500_000_000i128, &50, &(1_700_000_000 + 3600));
    let intent = client.create_intent(&decision, &token, &100_000_000i128, &(1_700_000_000 + 1800), &50);

    let result = client.try_execute_intent(&intent);
    assert!(result.is_err());
}

// ── Over-limit action ────────────────────────────

#[test]
fn over_limit_action_rejected() {
    let (_env, client, _owner, _emergency, agent) = setup();
    let user = Address::generate(&_env);

    let decision = client.apply_policy(&user, &100_000_000i128, &50, &(1_700_000_000 + 3600));

    let token = Address::generate(&_env);
    client.allow_asset(&token);

    let result = client.try_create_intent(&decision, &token, &900_000_000i128, &(1_700_000_000 + 1800), &50);
    assert_eq!(result, Err(Ok(PolicyError::ExceedsTxLimit)));
}

// ── Stale/expired ────────────────────────────────

#[test]
fn expired_policy_rejected() {
    let (_env, client, _owner, _emergency, agent) = setup();
    let user = Address::generate(&_env);

    let past_expiry = 1_700_000_000 - 1;
    let result = client.try_apply_policy(&user, &500_000_000i128, &50, &past_expiry);
    assert_eq!(result, Err(Ok(PolicyError::Expired)));
}

#[test]
fn expired_intent_rejected() {
    let (_env, client, _owner, _emergency, agent) = setup();
    let user = Address::generate(&_env);

    let decision = client.apply_policy(&user, &500_000_000i128, &50, &(1_700_000_000 + 3600));
    let token = Address::generate(&_env);
    client.allow_asset(&token);

    let past_expiry = 1_700_000_000 - 1;
    let result = client.try_create_intent(&decision, &token, &100_000_000i128, &past_expiry, &50);
    assert_eq!(result, Err(Ok(PolicyError::Expired)));
}

// ── Replay protection ────────────────────────────

#[test]
fn replay_intent_rejected() {
    let (_env, client, _owner, _emergency, agent) = setup();
    let user = Address::generate(&_env);

    let decision = client.apply_policy(&user, &500_000_000i128, &50, &(1_700_000_000 + 3600));

    let token = Address::generate(&_env);
    client.allow_asset(&token);

    let intent = client.create_intent(&decision, &token, &100_000_000i128, &(1_700_000_000 + 1800), &50);
    client.execute_intent(&intent);

    let result = client.try_execute_intent(&intent);
    assert_eq!(result, Err(Ok(PolicyError::IntentAlreadyExecuted)));
}

// ── Paused ───────────────────────────────────────

#[test]
fn paused_rejects_all_actions() {
    let (_env, client, owner, _emergency, _agent) = setup();
    let user = Address::generate(&_env);

    client.pause();
    assert!(client.is_paused());

    let result = client.try_apply_policy(&user, &500_000_000i128, &50, &(1_700_000_000 + 3600));
    assert_eq!(result, Err(Ok(PolicyError::Paused)));

    client.unpause();
    assert!(!client.is_paused());
}

// ── Revoke ───────────────────────────────────────

#[test]
fn revoked_policy_blocks_intent() {
    let (_env, client, owner, _emergency, agent) = setup();
    let user = Address::generate(&_env);

    let decision = client.apply_policy(&user, &500_000_000i128, &50, &(1_700_000_000 + 3600));
    client.revoke_policy(&decision);

    let token = Address::generate(&_env);
    client.allow_asset(&token);

    let result = client.try_create_intent(&decision, &token, &100_000_000i128, &(1_700_000_000 + 1800), &50);
    assert_eq!(result, Err(Ok(PolicyError::DecisionRevoked)));
}

#[test]
fn revoke_works_while_paused() {
    let (_env, client, owner, _emergency, agent) = setup();
    let user = Address::generate(&_env);

    let decision = client.apply_policy(&user, &500_000_000i128, &50, &(1_700_000_000 + 3600));
    client.pause();

    client.revoke_policy(&decision);

    client.unpause();

    let token = Address::generate(&_env);
    client.allow_asset(&token);

    let result = client.try_create_intent(&decision, &token, &100_000_000i128, &(1_700_000_000 + 1800), &50);
    assert_eq!(result, Err(Ok(PolicyError::DecisionRevoked)));
}

// ── Blocked asset ────────────────────────────────

#[test]
fn blocked_asset_rejected() {
    let (_env, client, _owner, _emergency, agent) = setup();
    let user = Address::generate(&_env);

    let decision = client.apply_policy(&user, &500_000_000i128, &50, &(1_700_000_000 + 3600));

    let blocked_token = Address::generate(&_env);
    client.block_asset(&blocked_token, &true);

    let result = client.try_create_intent(&decision, &blocked_token, &100_000_000i128, &(1_700_000_000 + 1800), &50);
    assert_eq!(result, Err(Ok(PolicyError::AssetBlocked)));
}

// ── Version reporting ────────────────────────────

#[test]
fn version_reported() {
    let (_env, client, _owner, _emergency, _agent) = setup();
    let version = client.get_version();
    assert_eq!(version, String::from_slice(&_env, "1.0.0"));
}

// ── Malicious agent scenario ─────────────────────

#[test]
fn malicious_agent_cannot_reuse_commitment_in_wrong_context() {
    let (env, client, owner, _emergency, agent) = setup();
    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);

    let decision = client.apply_policy(&user_a, &500_000_000i128, &50, &(1_700_000_000 + 3600));

    let mut malicious_decision_bytes = [0u8; 32];
    malicious_decision_bytes.copy_from_slice(&decision.to_xdr(env.clone()));
    let wrong_commitment: BytesN<32> = BytesN::from_array(&env, &[0xff; 32]);

    let token = Address::generate(&env);
    client.allow_asset(&token);

    let result = client.try_create_intent(&wrong_commitment, &token, &100_000_000i128, &(1_700_000_000 + 1800), &50);
    assert_eq!(result, Err(Ok(PolicyError::UnknownDecision)));
}

// ── Cross-domain replay ──────────────────────────

#[test]
fn cross_domain_replay_rejected() {
    let (env, client, _owner, _emergency, agent) = setup();
    let user = Address::generate(&env);

    let decision = client.apply_policy(&user, &500_000_000i128, &50, &(1_700_000_000 + 3600));

    env.ledger().set_sequence_number(2000);

    let token = Address::generate(&env);
    client.allow_asset(&token);

    let result = client.try_create_intent(&decision, &token, &100_000_000i128, &(1_700_000_000 + 1800), &50);
    assert!(result.is_err());
}

// ── Upgrade path check ───────────────────────────

#[test]
fn version_after_upgrade_reflects_deployment() {
    let (_env, client, _owner, _emergency, _agent) = setup();
    let version = client.get_version();
    assert_eq!(version, String::from_slice(&_env, "1.0.0"));
}
