#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype,
    panic_with_error, vec, Address, Bytes, BytesN, Env, String, Symbol, Vec,
};

const INSTANCE_TTL_THRESHOLD: u32 = 30 * 24 * 60 * 60 / 5;
const INSTANCE_TTL_EXTEND_TO: u32 = 120 * 24 * 60 * 60 / 5;
const LEDGER_TTL_THRESHOLD: u32 = 60 * 24 * 60 * 60 / 5;
const LEDGER_TTL_EXTEND_TO: u32 = 365 * 24 * 60 * 60 / 5;

pub const VERSION: &str = "1.0.0";
pub const DOMAIN_SEPARATOR: &str = "GOLDEN_RACCOON_POLICY_V1";

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Owner,
    EmergencyAdmin,
    Agent,
    Paused,
    Nonce(Address),
    DailySpend(Address),
    LastDailyReset,
    MaxTransactionValue,
    MaxSlippageBps,
    MaxDailySpend,
    AllowedAsset(Address),
    BlockedAsset(Address),
    AllowedAssetList,
    BlockedAssetList,
    PolicyDecision(BytesN<32>),
    Intent(BytesN<32>),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PolicyDecision {
    pub decision_hash: BytesN<32>,
    pub user: Address,
    pub authorized_agent: Address,
    pub max_transaction_value: i128,
    pub max_slippage_bps: u32,
    pub nonce: u64,
    pub expiry: u64,
    pub revoked: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Intent {
    pub intent_hash: BytesN<32>,
    pub policy_commitment: BytesN<32>,
    pub target_token: Address,
    pub amount: i128,
    pub nonce: u64,
    pub expiry: u64,
    pub executed: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SpendLimit {
    pub spent: i128,
    pub reset_ledger: u32,
}

// ── Events ──────────────────────────────────────

#[contractevent]
pub struct PolicyApplied {
    #[topic]
    pub user: Address,
    pub decision_hash: BytesN<32>,
}

#[contractevent]
pub struct IntentCreated {
    #[topic]
    pub intent_hash: BytesN<32>,
    pub policy_commitment: BytesN<32>,
}

#[contractevent]
pub struct IntentExecuted {
    #[topic]
    pub intent_hash: BytesN<32>,
}

#[contractevent]
pub struct IntentRevoked {
    #[topic]
    pub intent_hash: BytesN<32>,
}

#[contractevent]
pub struct Paused {
    #[topic]
    pub by: Address,
}

#[contractevent]
pub struct Unpaused {
    #[topic]
    pub by: Address,
}

#[contractevent]
pub struct AssetAllowed {
    #[topic]
    pub asset: Address,
}

#[contractevent]
pub struct AssetBlocked {
    #[topic]
    pub asset: Address,
    pub blocked: bool,
}

#[contractevent]
pub struct LimitsUpdated {
    pub max_tx_value: i128,
    pub max_slippage_bps: u32,
    pub max_daily_spend: i128,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum PolicyError {
    Unauthorized = 1,
    NotOwner = 2,
    NotEmergencyAdmin = 3,
    NotAgent = 4,
    Paused = 5,
    AlreadyInitialized = 6,
    Expired = 7,
    ZeroAddress = 8,
    SlippageTooHigh = 9,
    AssetBlocked = 10,
    ZeroAmount = 11,
    ExceedsTxLimit = 12,
    ExceedsDailyLimit = 13,
    UnknownDecision = 14,
    DecisionRevoked = 15,
    UnknownIntent = 16,
    IntentAlreadyExecuted = 17,
    IntentExpired = 18,
    InvalidSlippage = 19,
    AlreadyAllowed = 20,
}

// ── Contract ─────────────────────────────────────

#[contract]
pub struct PolicyContract;

// ── Helpers ──────────────────────────────────────

fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
}

fn extend_entry(env: &Env, key: &DataKey) {
    env.storage().persistent().extend_ttl(key, LEDGER_TTL_THRESHOLD, LEDGER_TTL_EXTEND_TO);
}

fn require_not_paused(env: &Env) {
    if env.storage().instance().get::<DataKey, bool>(&DataKey::Paused).unwrap_or(false) {
        panic_with_error!(env, PolicyError::Paused);
    }
}

fn require_owner(env: &Env) {
    let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
    if env.current_contract_address() != owner {
        owner.require_auth();
    }
}

fn require_owner_or_emergency(env: &Env) {
    let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
    let emergency: Address = env.storage().instance().get(&DataKey::EmergencyAdmin).unwrap();
    if env.current_contract_address() != owner {
        let caller = env.current_contract_address();
        if caller == owner || caller == emergency {
            caller.require_auth();
        } else {
            panic_with_error!(env, PolicyError::Unauthorized);
        }
    }
}

fn require_agent(env: &Env) {
    let agent: Address = env.storage().instance().get(&DataKey::Agent).unwrap();
    agent.require_auth();
}

fn hash_policy_decision(env: &Env, user: &Address, agent: &Address, max_tx_value: i128, max_slippage: u32, nonce: u64, expiry: u64) -> BytesN<32> {
    let mut buf = Bytes::new(env);
    buf.append(&mut Bytes::from_slice(env, DOMAIN_SEPARATOR.as_bytes()));
    buf.append(&mut Bytes::from_slice(env, b"POLICY_DECISION"));
    buf.append(&mut env.ledger().sequence().to_be_bytes().to_vec());
    buf.append(&mut user.to_xdr(env));
    buf.append(&mut agent.to_xdr(env));
    buf.append(&mut max_tx_value.to_be_bytes().to_vec());
    buf.append(&mut max_slippage.to_be_bytes().to_vec());
    buf.append(&mut nonce.to_be_bytes().to_vec());
    buf.append(&mut expiry.to_be_bytes().to_vec());
    env.crypto().keccak256(&buf).into()
}

fn hash_intent(env: &Env, policy_commitment: &BytesN<32>, target_token: &Address, amount: i128, nonce: u64, expiry: u64) -> BytesN<32> {
    let mut buf = Bytes::new(env);
    buf.append(&mut Bytes::from_slice(env, DOMAIN_SEPARATOR.as_bytes()));
    buf.append(&mut Bytes::from_slice(env, b"POLICY_INTENT"));
    buf.append(&mut env.ledger().sequence().to_be_bytes().to_vec());
    buf.append(&mut policy_commitment.to_xdr(env));
    buf.append(&mut target_token.to_xdr(env));
    buf.append(&mut amount.to_be_bytes().to_vec());
    buf.append(&mut nonce.to_be_bytes().to_vec());
    buf.append(&mut expiry.to_be_bytes().to_vec());
    env.crypto().keccak256(&buf).into()
}

#[contractimpl]
impl PolicyContract {
    // ── Initialization ─────────────────────────────

    pub fn initialize(env: Env, owner: Address, emergency_admin: Address, agent: Address) {
        if env.storage().instance().has(&DataKey::Owner) {
            panic_with_error!(&env, PolicyError::AlreadyInitialized);
        }
        owner.require_auth();
        env.storage().instance().set(&DataKey::Owner, &owner);
        env.storage().instance().set(&DataKey::EmergencyAdmin, &emergency_admin);
        env.storage().instance().set(&DataKey::Agent, &agent);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage().instance().set(&DataKey::MaxTransactionValue, &0i128);
        env.storage().instance().set::<u32>(&DataKey::MaxSlippageBps, &100);
        env.storage().instance().set::<i128>(&DataKey::MaxDailySpend, &0i128);
        bump_instance(&env);
    }

    // ── Admin / Configuration ──────────────────────

    pub fn set_emergency_admin(env: Env, admin: Address) {
        require_owner(&env);
        env.storage().instance().set(&DataKey::EmergencyAdmin, &admin);
        bump_instance(&env);
    }

    pub fn set_agent(env: Env, new_agent: Address) {
        require_owner(&env);
        env.storage().instance().set(&DataKey::Agent, &new_agent);
        bump_instance(&env);
    }

    pub fn set_limits(env: Env, max_tx_value: i128, max_slippage_bps: u32, max_daily_spend: i128) {
        require_owner(&env);
        if max_slippage_bps > 10_000 {
            panic_with_error!(&env, PolicyError::SlippageTooHigh);
        }
        env.storage().instance().set(&DataKey::MaxTransactionValue, &max_tx_value);
        env.storage().instance().set(&DataKey::MaxSlippageBps, &max_slippage_bps);
        env.storage().instance().set(&DataKey::MaxDailySpend, &max_daily_spend);
        LimitsUpdated { max_tx_value, max_slippage_bps, max_daily_spend }.publish(&env);
        bump_instance(&env);
    }

    pub fn allow_asset(env: Env, asset: Address) {
        require_owner(&env);
        if env.storage().persistent().has(&DataKey::BlockedAsset(asset.clone())) {
            panic_with_error!(&env, PolicyError::AssetBlocked);
        }
        env.storage().persistent().set(&DataKey::AllowedAsset(asset.clone()), &true);
        extend_entry(&env, &DataKey::AllowedAsset(asset.clone()));
        let mut list: Vec<Address> = env.storage().instance().get(&DataKey::AllowedAssetList).unwrap_or(Vec::new(&env));
        list.push_back(asset.clone());
        env.storage().instance().set(&DataKey::AllowedAssetList, &list);
        AssetAllowed { asset }.publish(&env);
        bump_instance(&env);
    }

    pub fn block_asset(env: Env, asset: Address, blocked: bool) {
        require_owner(&env);
        env.storage().persistent().set(&DataKey::BlockedAsset(asset.clone()), &blocked);
        if blocked {
            env.storage().persistent().remove(&DataKey::AllowedAsset(asset.clone()));
            let mut list: Vec<Address> = env.storage().instance().get(&DataKey::BlockedAssetList).unwrap_or(Vec::new(&env));
            list.push_back(asset.clone());
            env.storage().instance().set(&DataKey::BlockedAssetList, &list);
        }
        AssetBlocked { asset, blocked }.publish(&env);
        bump_instance(&env);
    }

    pub fn is_asset_allowed(env: Env, asset: Address) -> bool {
        if env.storage().persistent().get::<DataKey, bool>(&DataKey::BlockedAsset(asset.clone())).unwrap_or(false) {
            return false;
        }
        if env.storage().persistent().get::<DataKey, bool>(&DataKey::AllowedAsset(asset.clone())).unwrap_or(false) {
            return true;
        }
        let list: Vec<Address> = env.storage().instance().get(&DataKey::AllowedAssetList).unwrap_or(Vec::new(&env));
        list.is_empty()
    }

    // ── Pause / Emergency ──────────────────────────

    pub fn pause(env: Env) {
        require_owner(&env);
        env.storage().instance().set(&DataKey::Paused, &true);
        Paused { by: env.current_contract_address() }.publish(&env);
        bump_instance(&env);
    }

    pub fn unpause(env: Env) {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();
        env.storage().instance().set(&DataKey::Paused, &false);
        Unpaused { by: owner }.publish(&env);
        bump_instance(&env);
    }

    // ── Policy Application ─────────────────────────

    pub fn apply_policy(
        env: Env,
        user: Address,
        max_tx_value: i128,
        max_slippage: u32,
        expiry: u64,
    ) -> BytesN<32> {
        require_not_paused(&env);
        require_agent(&env);

        if expiry <= env.ledger().timestamp() {
            panic_with_error!(&env, PolicyError::Expired);
        }
        if max_slippage > 10_000 {
            panic_with_error!(&env, PolicyError::InvalidSlippage);
        }

        let nonce_key = DataKey::Nonce(user.clone());
        let current_nonce: u64 = env.storage().instance().get(&nonce_key).unwrap_or(0);
        let nonce = current_nonce.saturating_add(1);
        env.storage().instance().set(&nonce_key, &nonce);

        let agent: Address = env.storage().instance().get(&DataKey::Agent).unwrap();
        let decision_hash = hash_policy_decision(&env, &user, &agent, max_tx_value, max_slippage, nonce, expiry);

        let decision = PolicyDecision {
            decision_hash: decision_hash.clone(),
            user: user.clone(),
            authorized_agent: agent.clone(),
            max_transaction_value: max_tx_value,
            max_slippage_bps: max_slippage,
            nonce,
            expiry,
            revoked: false,
        };

        let key = DataKey::PolicyDecision(decision_hash.clone());
        env.storage().persistent().set(&key, &decision);
        extend_entry(&env, &key);

        PolicyApplied { user, decision_hash: decision_hash.clone() }.publish(&env);
        bump_instance(&env);
        decision_hash
    }

    pub fn revoke_policy(env: Env, decision_hash: BytesN<32>) {
        require_owner(&env);
        let key = DataKey::PolicyDecision(decision_hash.clone());
        let mut decision: PolicyDecision = match env.storage().persistent().get(&key) {
            Some(d) => d,
            None => panic_with_error!(&env, PolicyError::UnknownDecision),
        };
        decision.revoked = true;
        env.storage().persistent().set(&key, &decision);
        extend_entry(&env, &key);
        IntentRevoked { intent_hash: decision_hash }.publish(&env);
        bump_instance(&env);
    }

    // ── Intent Lifecycle ───────────────────────────

    pub fn create_intent(
        env: Env,
        policy_commitment: BytesN<32>,
        target_token: Address,
        amount: i128,
        expiry: u64,
        slippage_bps: u32,
    ) -> BytesN<32> {
        require_not_paused(&env);
        require_agent(&env);

        if expiry <= env.ledger().timestamp() {
            panic_with_error!(&env, PolicyError::Expired);
        }
        if amount <= 0 {
            panic_with_error!(&env, PolicyError::ZeroAmount);
        }

        let max_tx: i128 = env.storage().instance().get(&DataKey::MaxTransactionValue).unwrap_or(0);
        if max_tx > 0 && amount > max_tx {
            panic_with_error!(&env, PolicyError::ExceedsTxLimit);
        }

        let max_slippage: u32 = env.storage().instance().get(&DataKey::MaxSlippageBps).unwrap_or(100);
        if slippage_bps > max_slippage {
            panic_with_error!(&env, PolicyError::SlippageTooHigh);
        }

        if !Self::is_asset_allowed(env.clone(), target_token.clone()) {
            panic_with_error!(&env, PolicyError::AssetBlocked);
        }

        let decision_key = DataKey::PolicyDecision(policy_commitment.clone());
        let decision: PolicyDecision = match env.storage().persistent().get(&decision_key) {
            Some(d) => d,
            None => panic_with_error!(&env, PolicyError::UnknownDecision),
        };
        if decision.revoked {
            panic_with_error!(&env, PolicyError::DecisionRevoked);
        }
        if decision.expiry < expiry {
            panic_with_error!(&env, PolicyError::Expired);
        }

        let nonce = decision.nonce;

        Self::check_daily_spend(env.clone(), amount);

        let intent_hash = hash_intent(&env, &policy_commitment, &target_token, amount, nonce, expiry);

        let intent = Intent {
            intent_hash: intent_hash.clone(),
            policy_commitment,
            target_token,
            amount,
            nonce,
            expiry,
            executed: false,
        };

        let key = DataKey::Intent(intent_hash.clone());
        env.storage().persistent().set(&key, &intent);
        extend_entry(&env, &key);

        IntentCreated { intent_hash: intent_hash.clone(), policy_commitment: intent.policy_commitment }.publish(&env);
        bump_instance(&env);
        intent_hash
    }

    pub fn execute_intent(env: Env, intent_hash: BytesN<32>) {
        require_not_paused(&env);
        require_agent(&env);

        let key = DataKey::Intent(intent_hash.clone());
        let mut intent: Intent = match env.storage().persistent().get(&key) {
            Some(i) => i,
            None => panic_with_error!(&env, PolicyError::UnknownIntent),
        };
        if intent.executed {
            panic_with_error!(&env, PolicyError::IntentAlreadyExecuted);
        }
        if intent.expiry < env.ledger().timestamp() {
            panic_with_error!(&env, PolicyError::IntentExpired);
        }

        let decision_key = DataKey::PolicyDecision(intent.policy_commitment.clone());
        let decision: PolicyDecision = match env.storage().persistent().get(&decision_key) {
            Some(d) => d,
            None => panic_with_error!(&env, PolicyError::UnknownDecision),
        };
        if decision.revoked {
            panic_with_error!(&env, PolicyError::DecisionRevoked);
        }

        intent.executed = true;
        env.storage().persistent().set(&key, &intent);
        extend_entry(&env, &key);

        IntentExecuted { intent_hash }.publish(&env);
        bump_instance(&env);
    }

    pub fn revoke_intent(env: Env, intent_hash: BytesN<32>) {
        require_owner(&env);
        let key = DataKey::Intent(intent_hash.clone());
        let mut intent: Intent = match env.storage().persistent().get(&key) {
            Some(i) => i,
            None => panic_with_error!(&env, PolicyError::UnknownIntent),
        };
        intent.executed = true;
        env.storage().persistent().set(&key, &intent);
        extend_entry(&env, &key);
        IntentRevoked { intent_hash }.publish(&env);
        bump_instance(&env);
    }

    // ── Internal ───────────────────────────────────

    pub fn check_daily_spend(env: Env, amount: i128) {
        let max_daily: i128 = env.storage().instance().get(&DataKey::MaxDailySpend).unwrap_or(0);
        if max_daily <= 0 {
            return;
        }

        let spend_key = DataKey::DailySpend(env.current_contract_address());
        let reset_key = DataKey::LastDailyReset;
        let current_ledger = env.ledger().sequence();
        let mut reset_ledger: u32 = env.storage().instance().get(&reset_key).unwrap_or(0);

        let daily_window: u32 = 1440;
        let mut spent: i128 = 0;

        if reset_ledger == 0 || current_ledger.saturating_sub(reset_ledger) >= daily_window {
            reset_ledger = current_ledger;
            env.storage().instance().set(&reset_key, &reset_ledger);
            env.storage().instance().set::<i128>(&spend_key, &amount);
        } else {
            spent = env.storage().instance().get::<DataKey, i128>(&spend_key).unwrap_or(0);
            let new_spent = spent.saturating_add(amount);
            if new_spent > max_daily {
                panic_with_error!(&env, PolicyError::ExceedsDailyLimit);
            }
            env.storage().instance().set(&spend_key, &new_spent);
        }
    }

    // ── Views ──────────────────────────────────────

    pub fn get_version() -> String {
        String::from_slice(&Env::default(), VERSION)
    }

    pub fn get_policy_decision(env: Env, decision_hash: BytesN<32>) -> Option<PolicyDecision> {
        let key = DataKey::PolicyDecision(decision_hash);
        let value = env.storage().persistent().get(&key);
        if value.is_some() {
            extend_entry(&env, &key);
        }
        value
    }

    pub fn get_intent(env: Env, intent_hash: BytesN<32>) -> Option<Intent> {
        let key = DataKey::Intent(intent_hash);
        let value = env.storage().persistent().get(&key);
        if value.is_some() {
            extend_entry(&env, &key);
        }
        value
    }

    pub fn owner(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Owner).unwrap()
    }

    pub fn emergency_admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::EmergencyAdmin).unwrap()
    }

    pub fn agent(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Agent).unwrap()
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
    }
}

#[cfg(test)]
mod test;
