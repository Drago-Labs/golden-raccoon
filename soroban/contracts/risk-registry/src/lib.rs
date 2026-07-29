#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env,
    String, Symbol, Vec,
};

const INSTANCE_TTL_THRESHOLD: u32 = 30 * 24 * 60 * 60 / 5;
const INSTANCE_TTL_EXTEND_TO: u32 = 120 * 24 * 60 * 60 / 5;
const RECORD_TTL_THRESHOLD: u32 = 60 * 24 * 60 * 60 / 5;
const RECORD_TTL_EXTEND_TO: u32 = 365 * 24 * 60 * 60 / 5;
const MAX_FUTURE_SECONDS: u64 = 300;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Initialized,
    Publisher(Address),
    Record(BytesN<32>, Symbol),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RiskRecord {
    pub asset_id: BytesN<32>,
    pub network: Symbol,
    pub asset_label: String,
    pub score: u32,
    pub verdict: Symbol,
    pub report_hash: BytesN<32>,
    pub evidence_uri: String,
    pub publisher: Address,
    pub updated_at: u64,
    pub ledger: u32,
}

#[contractevent]
pub struct RegistryInitialized {
    #[topic]
    pub admin: Address,
}

#[contractevent]
pub struct PublisherAuthorizationChanged {
    #[topic]
    pub publisher: Address,
    pub authorized: bool,
}

#[contractevent]
pub struct RiskPublished {
    #[topic]
    pub asset_id: BytesN<32>,
    #[topic]
    pub network: Symbol,
    #[topic]
    pub publisher: Address,
    pub score: u32,
    pub verdict: Symbol,
    pub report_hash: BytesN<32>,
    pub updated_at: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum RegistryError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    UnauthorizedPublisher = 3,
    InvalidScore = 4,
    FutureTimestamp = 5,
    StaleReport = 6,
}

#[contract]
pub struct RiskRegistry;

fn bump_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
}

fn require_initialized(env: &Env) -> Result<(), RegistryError> {
    if env.storage().instance().has(&DataKey::Initialized) {
        bump_instance_ttl(env);
        Ok(())
    } else {
        Err(RegistryError::NotInitialized)
    }
}

#[contractimpl]
impl RiskRegistry {
    pub fn initialize(
        env: Env,
        admin: Address,
        publishers: Vec<Address>,
    ) -> Result<(), RegistryError> {
        if env.storage().instance().has(&DataKey::Initialized) {
            return Err(RegistryError::AlreadyInitialized);
        }

        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Initialized, &true);
        for publisher in publishers.iter() {
            env.storage()
                .persistent()
                .set(&DataKey::Publisher(publisher.clone()), &true);
            env.storage().persistent().extend_ttl(
                &DataKey::Publisher(publisher.clone()),
                RECORD_TTL_THRESHOLD,
                RECORD_TTL_EXTEND_TO,
            );
        }
        bump_instance_ttl(&env);
        RegistryInitialized { admin }.publish(&env);
        Ok(())
    }

    pub fn set_publisher(
        env: Env,
        publisher: Address,
        authorized: bool,
    ) -> Result<(), RegistryError> {
        require_initialized(&env)?;
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        let key = DataKey::Publisher(publisher.clone());

        if authorized {
            env.storage().persistent().set(&key, &true);
            env.storage()
                .persistent()
                .extend_ttl(&key, RECORD_TTL_THRESHOLD, RECORD_TTL_EXTEND_TO);
        } else {
            env.storage().persistent().remove(&key);
        }
        PublisherAuthorizationChanged {
            publisher,
            authorized,
        }
        .publish(&env);
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn publish_risk(
        env: Env,
        publisher: Address,
        asset_id: BytesN<32>,
        network: Symbol,
        asset_label: String,
        score: u32,
        verdict: Symbol,
        report_hash: BytesN<32>,
        evidence_uri: String,
        updated_at: u64,
    ) -> Result<RiskRecord, RegistryError> {
        require_initialized(&env)?;
        publisher.require_auth();

        if !Self::is_publisher(env.clone(), publisher.clone()) {
            return Err(RegistryError::UnauthorizedPublisher);
        }
        if score > 100 {
            return Err(RegistryError::InvalidScore);
        }
        if updated_at > env.ledger().timestamp().saturating_add(MAX_FUTURE_SECONDS) {
            return Err(RegistryError::FutureTimestamp);
        }

        let key = DataKey::Record(asset_id.clone(), network.clone());
        if let Some(existing) = env.storage().persistent().get::<DataKey, RiskRecord>(&key) {
            if updated_at <= existing.updated_at {
                return Err(RegistryError::StaleReport);
            }
        }

        let record = RiskRecord {
            asset_id: asset_id.clone(),
            network: network.clone(),
            asset_label,
            score,
            verdict: verdict.clone(),
            report_hash: report_hash.clone(),
            evidence_uri,
            publisher: publisher.clone(),
            updated_at,
            ledger: env.ledger().sequence(),
        };
        env.storage().persistent().set(&key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&key, RECORD_TTL_THRESHOLD, RECORD_TTL_EXTEND_TO);
        RiskPublished {
            asset_id,
            network,
            publisher,
            score,
            verdict,
            report_hash,
            updated_at,
        }
        .publish(&env);
        Ok(record)
    }

    pub fn get_risk(env: Env, asset_id: BytesN<32>, network: Symbol) -> Option<RiskRecord> {
        let key = DataKey::Record(asset_id, network);
        let value = env.storage().persistent().get(&key);
        if value.is_some() {
            env.storage()
                .persistent()
                .extend_ttl(&key, RECORD_TTL_THRESHOLD, RECORD_TTL_EXTEND_TO);
        }
        value
    }

    pub fn is_publisher(env: Env, publisher: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Publisher(publisher))
            .unwrap_or(false)
    }

    pub fn admin(env: Env) -> Result<Address, RegistryError> {
        require_initialized(&env)?;
        Ok(env.storage().instance().get(&DataKey::Admin).unwrap())
    }
}

#[cfg(test)]
mod test;
