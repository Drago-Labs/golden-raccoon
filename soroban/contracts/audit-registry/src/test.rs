extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, BytesN, Env,
};

const NOW: u64 = 1_700_000_000;

fn hash(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

fn zero_hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[0u8; 32])
}

/// Deploy the contract with a user who has committed to a policy and authorized
/// one agent for an hour.
fn setup() -> (
    Env,
    AuditRegistryClient<'static>,
    Address,
    Address,
    BytesN<32>,
) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(NOW);

    let contract_id = env.register(AuditRegistry, ());
    let client = AuditRegistryClient::new(&env, &contract_id);
    let user = Address::generate(&env);
    let agent = Address::generate(&env);
    let policy = hash(&env, 1);

    client.set_policy(&user, &policy);
    client.authorize_agent(&user, &agent, &policy, &(NOW + 3_600));

    (env, client, user, agent, policy)
}

// ---------------------------------------------------------------------------
// Version and non-custody
// ---------------------------------------------------------------------------

#[test]
fn reports_its_interface_version() {
    let (_env, client, _, _, _) = setup();
    assert_eq!(client.version(), VERSION);
}

// ---------------------------------------------------------------------------
// Policy and authorization
// ---------------------------------------------------------------------------

#[test]
fn records_policy_and_authorization() {
    let (env, client, user, agent, policy) = setup();

    assert_eq!(client.policy_of(&user), Some(policy.clone()));
    assert!(client.is_agent_live(&user, &agent));

    let authorization = client.authorization_of(&user, &agent).unwrap();
    assert_eq!(authorization.policy_hash, policy);
    assert_eq!(authorization.expires_at, NOW + 3_600);
    assert!(authorization.active);

    // An agent that was never authorized is not live.
    let stranger = Address::generate(&env);
    assert!(!client.is_agent_live(&user, &stranger));
    assert_eq!(client.authorization_of(&user, &stranger), None);
}

#[test]
fn rejects_zero_hashes() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(NOW);
    let client = AuditRegistryClient::new(&env, &env.register(AuditRegistry, ()));
    let user = Address::generate(&env);
    let agent = Address::generate(&env);

    assert_eq!(
        client.try_set_policy(&user, &zero_hash(&env)),
        Err(Ok(AuditError::ZeroHash))
    );

    client.set_policy(&user, &hash(&env, 1));
    assert_eq!(
        client.try_authorize_agent(&user, &agent, &zero_hash(&env), &(NOW + 60)),
        Err(Ok(AuditError::ZeroHash))
    );
}

#[test]
fn authorization_requires_a_committed_policy() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(NOW);
    let client = AuditRegistryClient::new(&env, &env.register(AuditRegistry, ()));
    let user = Address::generate(&env);
    let agent = Address::generate(&env);

    // No policy set at all.
    assert_eq!(
        client.try_authorize_agent(&user, &agent, &hash(&env, 1), &(NOW + 60)),
        Err(Ok(AuditError::PolicyNotSet))
    );

    // A policy that is not the one the user committed to.
    client.set_policy(&user, &hash(&env, 1));
    assert_eq!(
        client.try_authorize_agent(&user, &agent, &hash(&env, 2), &(NOW + 60)),
        Err(Ok(AuditError::PolicyMismatch))
    );
}

#[test]
fn rejects_bad_authorization_windows() {
    let (env, client, user, _, policy) = setup();
    let agent = Address::generate(&env);

    assert_eq!(
        client.try_authorize_agent(&user, &agent, &policy, &NOW),
        Err(Ok(AuditError::ExpiryInPast))
    );
    assert_eq!(
        client.try_authorize_agent(&user, &agent, &policy, &(NOW - 1)),
        Err(Ok(AuditError::ExpiryInPast))
    );
    assert_eq!(
        client.try_authorize_agent(
            &user,
            &agent,
            &policy,
            &(NOW + MAX_AUTHORIZATION_WINDOW + 1)
        ),
        Err(Ok(AuditError::WindowTooLong))
    );

    // The boundary itself is allowed.
    client.authorize_agent(&user, &agent, &policy, &(NOW + MAX_AUTHORIZATION_WINDOW));
    assert!(client.is_agent_live(&user, &agent));
}

// ---------------------------------------------------------------------------
// Decision logging
// ---------------------------------------------------------------------------

#[test]
fn authorized_agent_can_log_a_decision() {
    let (env, client, user, agent, policy) = setup();

    client.log_decision(
        &user,
        &agent,
        &policy,
        &hash(&env, 10),
        &hash(&env, 11),
        &74,
    );
}

#[test]
fn unauthorized_actions_fail() {
    let (env, client, user, agent, policy) = setup();
    let stranger = Address::generate(&env);

    // Never authorized.
    assert_eq!(
        client.try_log_decision(
            &user,
            &stranger,
            &policy,
            &hash(&env, 10),
            &hash(&env, 11),
            &50
        ),
        Err(Ok(AuditError::NotAuthorized))
    );

    // Revoked.
    client.revoke_agent(&user, &agent);
    assert!(!client.is_agent_live(&user, &agent));
    assert_eq!(
        client.try_log_decision(
            &user,
            &agent,
            &policy,
            &hash(&env, 10),
            &hash(&env, 11),
            &50
        ),
        Err(Ok(AuditError::NotAuthorized))
    );

    // The record is retained so a reader can tell revoked from never-authorized.
    let authorization = client.authorization_of(&user, &agent).unwrap();
    assert!(!authorization.active);
}

#[test]
fn expired_authorization_fails_without_revocation() {
    let (env, client, user, agent, policy) = setup();

    env.ledger().set_timestamp(NOW + 3_601);

    assert!(!client.is_agent_live(&user, &agent));
    assert_eq!(
        client.try_log_decision(
            &user,
            &agent,
            &policy,
            &hash(&env, 10),
            &hash(&env, 11),
            &50
        ),
        Err(Ok(AuditError::AuthorizationExpired))
    );
}

#[test]
fn rotating_the_policy_invalidates_work_computed_against_the_old_one() {
    let (env, client, user, agent, policy) = setup();

    // The user adopts a new policy without touching the authorization.
    client.set_policy(&user, &hash(&env, 2));

    // The agent's old policy no longer matches the authorization it holds.
    assert_eq!(
        client.try_log_decision(
            &user,
            &agent,
            &policy,
            &hash(&env, 10),
            &hash(&env, 11),
            &50
        ),
        Err(Ok(AuditError::PolicyMismatch))
    );

    // Presenting the new policy also fails, because the grant was issued under
    // the old one — the user must re-authorize deliberately.
    assert_eq!(
        client.try_log_decision(
            &user,
            &agent,
            &hash(&env, 2),
            &hash(&env, 10),
            &hash(&env, 11),
            &50
        ),
        Err(Ok(AuditError::PolicyMismatch))
    );

    client.authorize_agent(&user, &agent, &hash(&env, 2), &(NOW + 3_600));
    client.log_decision(
        &user,
        &agent,
        &hash(&env, 2),
        &hash(&env, 10),
        &hash(&env, 11),
        &50,
    );
}

#[test]
fn rejects_invalid_decision_bounds_and_hashes() {
    let (env, client, user, agent, policy) = setup();

    assert_eq!(
        client.try_log_decision(
            &user,
            &agent,
            &policy,
            &hash(&env, 10),
            &hash(&env, 11),
            &101
        ),
        Err(Ok(AuditError::InvalidBuyRisk))
    );
    assert_eq!(
        client.try_log_decision(
            &user,
            &agent,
            &policy,
            &zero_hash(&env),
            &hash(&env, 11),
            &50
        ),
        Err(Ok(AuditError::ZeroHash))
    );
    assert_eq!(
        client.try_log_decision(
            &user,
            &agent,
            &policy,
            &hash(&env, 10),
            &zero_hash(&env),
            &50
        ),
        Err(Ok(AuditError::ZeroHash))
    );

    // The bound itself is valid.
    client.log_decision(
        &user,
        &agent,
        &policy,
        &hash(&env, 10),
        &hash(&env, 11),
        &100,
    );
}

// ---------------------------------------------------------------------------
// Execution intents: replay and staleness
// ---------------------------------------------------------------------------

#[test]
fn records_an_intent_once() {
    let (env, client, user, agent, policy) = setup();
    let intent_id = hash(&env, 20);

    assert!(!client.is_intent_used(&user, &intent_id));

    client.record_intent(
        &user,
        &agent,
        &policy,
        &intent_id,
        &hash(&env, 10),
        &hash(&env, 21),
        &(NOW + 300),
    );

    assert!(client.is_intent_used(&user, &intent_id));
}

#[test]
fn replayed_intents_fail() {
    let (env, client, user, agent, policy) = setup();
    let intent_id = hash(&env, 20);

    client.record_intent(
        &user,
        &agent,
        &policy,
        &intent_id,
        &hash(&env, 10),
        &hash(&env, 21),
        &(NOW + 300),
    );

    // The same id again, even with a different payload, is a replay.
    assert_eq!(
        client.try_record_intent(
            &user,
            &agent,
            &policy,
            &intent_id,
            &hash(&env, 12),
            &hash(&env, 22),
            &(NOW + 300),
        ),
        Err(Ok(AuditError::IntentReplayed))
    );

    // A different id is fine.
    client.record_intent(
        &user,
        &agent,
        &policy,
        &hash(&env, 23),
        &hash(&env, 10),
        &hash(&env, 21),
        &(NOW + 300),
    );
}

#[test]
fn stale_intents_fail() {
    let (env, client, user, agent, policy) = setup();

    // Already expired.
    assert_eq!(
        client.try_record_intent(
            &user,
            &agent,
            &policy,
            &hash(&env, 20),
            &hash(&env, 10),
            &hash(&env, 21),
            &(NOW - 1),
        ),
        Err(Ok(AuditError::IntentStale))
    );

    // Expiring exactly now is stale too: there is no window left to act in.
    assert_eq!(
        client.try_record_intent(
            &user,
            &agent,
            &policy,
            &hash(&env, 20),
            &hash(&env, 10),
            &hash(&env, 21),
            &NOW,
        ),
        Err(Ok(AuditError::IntentStale))
    );

    // Beyond the maximum window an intent is stale by construction.
    assert_eq!(
        client.try_record_intent(
            &user,
            &agent,
            &policy,
            &hash(&env, 20),
            &hash(&env, 10),
            &hash(&env, 21),
            &(NOW + MAX_INTENT_WINDOW + 1),
        ),
        Err(Ok(AuditError::WindowTooLong))
    );

    // An intent prepared earlier cannot be recorded after its deadline passes.
    env.ledger().set_timestamp(NOW + 400);
    assert_eq!(
        client.try_record_intent(
            &user,
            &agent,
            &policy,
            &hash(&env, 20),
            &hash(&env, 10),
            &hash(&env, 21),
            &(NOW + 300),
        ),
        Err(Ok(AuditError::IntentStale))
    );
}

#[test]
fn intents_reject_zero_hashes_and_dead_agents() {
    let (env, client, user, agent, policy) = setup();

    assert_eq!(
        client.try_record_intent(
            &user,
            &agent,
            &policy,
            &zero_hash(&env),
            &hash(&env, 10),
            &hash(&env, 21),
            &(NOW + 300),
        ),
        Err(Ok(AuditError::ZeroHash))
    );
    assert_eq!(
        client.try_record_intent(
            &user,
            &agent,
            &policy,
            &hash(&env, 20),
            &hash(&env, 10),
            &zero_hash(&env),
            &(NOW + 300),
        ),
        Err(Ok(AuditError::ZeroHash))
    );

    client.revoke_agent(&user, &agent);
    assert_eq!(
        client.try_record_intent(
            &user,
            &agent,
            &policy,
            &hash(&env, 20),
            &hash(&env, 10),
            &hash(&env, 21),
            &(NOW + 300),
        ),
        Err(Ok(AuditError::NotAuthorized))
    );
}

// ---------------------------------------------------------------------------
// Pause
// ---------------------------------------------------------------------------

#[test]
fn pause_blocks_logging_and_unpause_restores_it() {
    let (env, client, user, agent, policy) = setup();

    client.set_paused(&user, &true);
    assert!(client.is_paused(&user));
    assert!(!client.is_agent_live(&user, &agent));

    assert_eq!(
        client.try_log_decision(
            &user,
            &agent,
            &policy,
            &hash(&env, 10),
            &hash(&env, 11),
            &50
        ),
        Err(Ok(AuditError::ContractPaused))
    );
    assert_eq!(
        client.try_record_intent(
            &user,
            &agent,
            &policy,
            &hash(&env, 20),
            &hash(&env, 10),
            &hash(&env, 21),
            &(NOW + 300),
        ),
        Err(Ok(AuditError::ContractPaused))
    );

    // Reads stay available while paused.
    assert_eq!(client.policy_of(&user), Some(policy.clone()));
    assert!(client.authorization_of(&user, &agent).is_some());
    assert_eq!(client.version(), VERSION);

    client.set_paused(&user, &false);
    assert!(!client.is_paused(&user));
    client.log_decision(
        &user,
        &agent,
        &policy,
        &hash(&env, 10),
        &hash(&env, 11),
        &50,
    );
}

#[test]
fn pause_is_scoped_to_one_user() {
    let (env, client, user, _, _) = setup();
    let other_user = Address::generate(&env);
    let other_agent = Address::generate(&env);
    let other_policy = hash(&env, 5);

    client.set_policy(&other_user, &other_policy);
    client.authorize_agent(&other_user, &other_agent, &other_policy, &(NOW + 3_600));

    client.set_paused(&user, &true);

    // One user's pause must not halt another user's agent.
    assert!(client.is_agent_live(&other_user, &other_agent));
    client.log_decision(
        &other_user,
        &other_agent,
        &other_policy,
        &hash(&env, 10),
        &hash(&env, 11),
        &50,
    );
}

// ---------------------------------------------------------------------------
// Revocation
// ---------------------------------------------------------------------------

#[test]
fn revocation_is_idempotent() {
    let (env, client, user, agent, _) = setup();
    let never_authorized = Address::generate(&env);

    // Revoking an agent that was never authorized must not revert: a user
    // reacting to an incident should never be blocked.
    client.revoke_agent(&user, &never_authorized);

    client.revoke_agent(&user, &agent);
    client.revoke_agent(&user, &agent);
    assert!(!client.is_agent_live(&user, &agent));
}

#[test]
fn re_authorizing_after_revocation_works() {
    let (env, client, user, agent, policy) = setup();

    client.revoke_agent(&user, &agent);
    client.authorize_agent(&user, &agent, &policy, &(NOW + 600));

    assert!(client.is_agent_live(&user, &agent));
    client.log_decision(
        &user,
        &agent,
        &policy,
        &hash(&env, 10),
        &hash(&env, 11),
        &50,
    );
}

// ---------------------------------------------------------------------------
// Storage and TTL
// ---------------------------------------------------------------------------

#[test]
fn authorization_survives_beyond_the_default_entry_lifetime() {
    let (env, client, user, agent, policy) = setup();

    // Reading and writing bump the entry TTL, so an authorization that is still
    // within its own expiry window does not disappear underneath the user.
    env.ledger().set_sequence_number(ENTRY_TTL_THRESHOLD + 100);

    assert!(client.authorization_of(&user, &agent).is_some());
    assert_eq!(client.policy_of(&user), Some(policy));
}

#[test]
fn users_are_isolated_from_each_other() {
    let (env, client, user, agent, policy) = setup();
    let other_user = Address::generate(&env);

    // An agent authorized by one user has no standing with another.
    assert!(!client.is_agent_live(&other_user, &agent));
    assert_eq!(
        client.try_log_decision(
            &other_user,
            &agent,
            &policy,
            &hash(&env, 10),
            &hash(&env, 11),
            &50
        ),
        Err(Ok(AuditError::NotAuthorized))
    );

    // An intent id consumed for one user is still free for another.
    let intent_id = hash(&env, 20);
    client.record_intent(
        &user,
        &agent,
        &policy,
        &intent_id,
        &hash(&env, 10),
        &hash(&env, 21),
        &(NOW + 300),
    );
    assert!(client.is_intent_used(&user, &intent_id));
    assert!(!client.is_intent_used(&other_user, &intent_id));
}
