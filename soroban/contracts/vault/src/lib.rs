#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, BytesN, Env, String, Symbol,
};

const INSTANCE_TTL_THRESHOLD: u32 = 30 * 24 * 60 * 60 / 5;
const INSTANCE_TTL_EXTEND_TO: u32 = 120 * 24 * 60 * 60 / 5;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Policy,
    Agent,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum VaultError {
    NotAgent = 1,
    ZeroAmount = 2,
    ZeroRecipient = 3,
    IntentInvalid = 4,
    PolicyCallFailed = 5,
}

#[contractevent]
pub struct Withdrawn {
    #[topic]
    pub user: Address,
    #[topic]
    pub token: Address,
    pub amount: i128,
    #[topic]
    pub intent_hash: BytesN<32>,
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
}

fn get_intent_validity(
    env: &Env,
    policy: &Address,
    intent_hash: BytesN<32>,
    token: Address,
    amount: i128,
) -> bool {
    let result: (bool, String) = env.invoke_contract(
        policy,
        &Symbol::new(env, "get_intent_validity"),
        (intent_hash, token, amount),
    );
    result.0
}

#[contract]
pub struct VaultContract;

#[contractimpl]
impl VaultContract {
    pub fn initialize(env: Env, policy: Address, agent: Address) {
        if env.storage().instance().has(&DataKey::Policy) {
            panic_with_error!(&env, VaultError::NotAgent);
        }
        env.storage().instance().set(&DataKey::Policy, &policy);
        env.storage().instance().set(&DataKey::Agent, &agent);
        bump_instance(&env);
    }

    pub fn withdraw(
        env: Env,
        token: Address,
        amount: i128,
        recipient: Address,
        intent_hash: BytesN<32>,
    ) {
        let agent: Address = env.storage().instance().get(&DataKey::Agent).unwrap();
        agent.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, VaultError::ZeroAmount);
        }
        if recipient == Address::default() {
            panic_with_error!(&env, VaultError::ZeroRecipient);
        }

        let policy: Address = env.storage().instance().get(&DataKey::Policy).unwrap();
        if !get_intent_validity(&env, &policy, intent_hash.clone(), token.clone(), amount) {
            panic_with_error!(&env, VaultError::IntentInvalid);
        }

        token::Client::new(&env, &token).transfer(&recipient, &amount);

        Withdrawn {
            user: recipient,
            token,
            amount,
            intent_hash,
        }
        .publish(&env);
        bump_instance(&env);
    }
}
