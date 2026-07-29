extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    vec, Address, BytesN, Env, String, Symbol,
};

fn setup() -> (Env, RiskRegistryClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_700_000_000);
    let contract_id = env.register(RiskRegistry, ());
    let client = RiskRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let publisher = Address::generate(&env);
    client.initialize(&admin, &vec![&env, publisher.clone()]);
    (env, client, admin, publisher)
}

#[test]
fn authorized_publisher_can_publish_and_update() {
    let (env, client, _, publisher) = setup();
    let asset_id = BytesN::from_array(&env, &[7; 32]);
    let report_hash = BytesN::from_array(&env, &[9; 32]);
    let network = Symbol::new(&env, "testnet");

    client.publish_risk(
        &publisher,
        &asset_id,
        &network,
        &String::from_str(&env, "USDC:issuer"),
        &18,
        &Symbol::new(&env, "low"),
        &report_hash,
        &String::from_str(&env, "ipfs://report"),
        &1_700_000_000,
    );

    let stored = client.get_risk(&asset_id, &network).unwrap();
    assert_eq!(stored.score, 18);
    assert_eq!(stored.publisher, publisher);
}

#[test]
fn rejects_unauthorized_invalid_and_stale_reports() {
    let (env, client, _, publisher) = setup();
    let unknown = Address::generate(&env);
    let asset_id = BytesN::from_array(&env, &[1; 32]);
    let report_hash = BytesN::from_array(&env, &[2; 32]);
    let network = Symbol::new(&env, "testnet");
    let label = String::from_str(&env, "XLM");
    let verdict = Symbol::new(&env, "watch");
    let uri = String::from_str(&env, "https://example.invalid/report");

    assert_eq!(
        client.try_publish_risk(
            &unknown,
            &asset_id,
            &network,
            &label,
            &10,
            &verdict,
            &report_hash,
            &uri,
            &1_700_000_000
        ),
        Err(Ok(RegistryError::UnauthorizedPublisher))
    );
    assert_eq!(
        client.try_publish_risk(
            &publisher,
            &asset_id,
            &network,
            &label,
            &101,
            &verdict,
            &report_hash,
            &uri,
            &1_700_000_000
        ),
        Err(Ok(RegistryError::InvalidScore))
    );
    client.publish_risk(
        &publisher,
        &asset_id,
        &network,
        &label,
        &10,
        &verdict,
        &report_hash,
        &uri,
        &1_700_000_000,
    );
    assert_eq!(
        client.try_publish_risk(
            &publisher,
            &asset_id,
            &network,
            &label,
            &11,
            &verdict,
            &report_hash,
            &uri,
            &1_700_000_000
        ),
        Err(Ok(RegistryError::StaleReport))
    );
}

#[test]
fn admin_can_revoke_publisher() {
    let (_env, client, _, publisher) = setup();
    assert!(client.is_publisher(&publisher));
    client.set_publisher(&publisher, &false);
    assert!(!client.is_publisher(&publisher));
}
