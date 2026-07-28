# V2 Non-Custodial Contract Audit & Authorization Interfaces

| Field | Value |
| --- | --- |
| Issue | Drago-Labs/golden-raccoon#16 |
| Authors | Golden Raccoon contributors |
| Status | Implementation-ready; contributor answers in §9.5 pending maintainer sign-off |
| Roadmap coverage | V2-061, V2-062, V2-063, prerequisite decisions for V2-066 / V2-067 |
| Target networks | **Proposed primary targets:** EVM — GOAT Network (id 48816); Soroban — Stellar Testnet (pubnet-equivalent rollout deferred to a follow-up audit). Base Sepolia is documented as a secondary parallel testnet in §9.6. Maintainer can lock the choice in §9.1 / §9.5 with an approving comment. |
| Out of scope | Implementing or deploying the contracts; adding fund custody, swaps, or autonomous execution; choosing a production admin key inside this PR. |

This document is the implementation-ready contract specification that closes V2 contract requirements (V2-061..V2-063 and the prerequisite decisions for V2-066 / V2-067). It does not introduce implementation code. The matching test matrix is `docs/V2_CONTRACT_TEST_MATRIX.md`.

---

## 1. Goals and non-custodial guarantee

The V2 contract surface has three goals:

1. Provide an authoritative EVM audit log and a Soroban risk registry that the frontend can mirror and surface in the decision/execution timeline.
2. Define stable identity and authorization primitives so the frontend can correlate ledger events with its own `decision_id`, `lifecycleStatus`, `chainFamily`, and `idempotencyKey` records.
3. Preserve the non-custodial invariant: **the contracts never hold user tokens, sign on behalf of users, or move funds on their own**. The wallet is the only signer and the only mover of value.

Non-custodial proof (each contract):

| Invariant | GoldRaccoonVault (EVM) | RiskRegistry (Soroban) |
| --- | --- | --- |
| No `ERC20` / `transfer` / `transferFrom` / `swap` calls | ✅ contract exposes only `setAgent`, `setRules`, `logDecision`, `revokeAgent`, plus the new interface additions in §5; never calls into a token contract | ✅ contract exposes only `initialize`, `set_publisher`, `publish_risk`, `get_risk`, `is_publisher`, `admin` plus the new interface additions in §6; no token transfer |
| No private key custody | ✅ contract never holds a signer; `agent` is a public address authorized by the owner | ✅ contract requires `require_auth()` on the publisher for state writes; never holds a secret |
| Pause is reversible and never moves funds | ✅ emergency pause (§5) only suppresses writes; does not perform any `transfer`/`approve` | ✅ emergency pause (§6) only suppresses writes; no token interaction |
| Upgrade path is explicit and does not auto-execute work | ✅ §5.7 lays out a UUPS-style proxy with a meaningful upgrade delay and a quorum | ✅ §6.7 lays out Soroban versioned WASM with explicit `migrate` gated behind admin and a timelock |

---

## 2. V2 requirements traceability

| ID | Requirement | Owner | EVM (`GoldRaccoonVault`) | Soroban (`RiskRegistry`) |
| --- | --- | --- | --- | --- |
| V2-061 | Agent authorization and revocation | V2 | ✅ `setAgent` / `revokeAgent`; ⚠️ missing mulberry rotation, multi-agent allowlist, expiry | ✅ `set_publisher`; ⚠️ missing publisher expiry, multi-tier allowlist |
| V2-061 | Agent-list semantic events | V2 | ⚠️ `AgentApproved` / `AgentRevoked` use `owner+agent` topic; missing `previousAgent` and `revokedAt` | ✅ `PublisherAuthorizationChanged`; ⚠️ missing `revokedAt` |
| V2-062 | User-policy hash | V2 | ❌ missing — `setRules` only stores scalar thresholds | ❌ missing — registry does not store policy |
| V2-062 | Decision hash | V2 | ⚠️ `logDecision` stores opaque `decisionHash`; missing canonical encoding, replay protection, and intent binding | n/a (registry does not log decisions) |
| V2-063 | Execution-intent log | V2 | ❌ missing — no method to record the user's signed intent (intentHash, preparedTx hash, expiry) | ❌ missing — out of scope for risk registry |
| V2-063 | Emergency pause | V2 | ❌ missing — no `pause` / `unpause`; nothing stops the agent mid-flight | ❌ missing — admin cannot pause writes |
| V2-067 (prereq) | Version reporting | V2 | ❌ missing — no `version()` / `pa_version()`, no upgrade history | ❌ missing — no contract version, no `version()` entry |
| V2-067 (prereq) | Upgrade policy | V2 | ❌ missing — no proxy, no upgrade gate, no timelock | ❌ missing — no versioned WASM, no timelock |
| V2-066 (prereq) | Stable event taxonomy | V2 | ⚠️ event topics exist but lack replay events, policy events, intent events, pause events, version events | ⚠️ registry events exist but lack pause, version, rate-limit events |
| V2-066 (prereq) | Authorization boundaries | V2 | ⚠️ implicit in modifiers only; no role-bit doc | ⚠️ implicit in `require_auth` only; no token-revocation events |
| V2-066 (prereq) | Replay and stale-intent handling | V2 | ❌ missing — no nonce, no expiry, no replay guard | ❌ missing — registry has `StaleReport` for publish but not for upgrade |
| V2-066 (prereq) | Zero-address / zero-asset handling | V2 | ⚠️ `setAgent` rejects zero; `setRules` does not enforce non-zero diff | ✅ `initialize` rejects double-init; publisher must be a valid Address |
| V2-066 (prereq) | Invalid hash handling | V2 | ⚠️ `decisionHash` length checked, but no format or zero-hash rejection | ✅ `report_hash` is `BytesN<32>`; `0x00…00` is accepted but is part of the spec to reject |
| V2-066 (prereq) | Pause behavior | V2 | ❌ missing | ❌ missing |
| V2-066 (prereq) | Storage / TTL for Soroban | V2 | n/a | ⚠️ present for instance and persistent records; ⚠️ missing for `upgrade_pending` and `publisher_tier` |
| V2-066 (prereq) | Event indexing compatibility | V2 | ⚠️ topics use `indexed` correctly; need explicit `indexed` reset for the new events | ⚠️ `#[topic]` used correctly; need explicit `#[topic]` / data split for the new events |

V2-061..V2-063 are the headline scope items. V2-066 and V2-067 are prerequisite decisions that the spec must define before implementation work begins.

---

## 3. Frontend identifiers and canonical encoding

The frontend persists the following identifiers (see `frontend/src/server/storage/schema.sql` and `frontend/src/server/types.ts`). The contracts must encode and surface these deterministically so the frontend can correlate ledger events with its own records.

| Identifier | Frontend encoding | EVM canonical encoding | Soroban canonical encoding |
| --- | --- | --- | --- |
| `decision_id` | `string` (UUIDv4) | `bytes32` `keccak256(abi.encodePacked(uint256(block.chainid), wallet, decisionCounter))` (counter is storage-local) | `BytesN<32>` `sha256(network_short_name ++ wallet ++ counter)` with separator `\u0000` |
| `policy_hash` | `string` (64-hex) | `bytes32` `keccak256(abi.encode(maxRiskScore, maxTradePercent, maxMemeExposurePercent, maxSlippageBps, allowedChainsRosterHash, blockedTokensHash))` | bytes32 is unrelated to registry; if registry ever needs a policy hash it uses `sha256` of the same canonical form |
| `decision_hash` | `string` (64-hex) | `bytes32` `keccak256(abi.encode(decision_id, policy_hash, agent, createdAt, summaryLeaf))` | n/a |
| `intent_hash` | `string` (64-hex) | `bytes32` `keccak256(abi.encode(decision_hash, chainId, fromToken, toToken, percent, valueUsd, expiry, nonce))` | n/a |
| `execution_tx_hash` | `0x` 64-hex or 64-hex | already enforced; pass through | already enforced; pass through |
| `idempotency_key` | `string` (UTF-8 ≤160 chars) | pass through; never parsed on chain | pass through; never parsed on chain |
| `wallet_address` | `0x` 40-hex (EVM) or `G…` 56-char (Stellar) | pass through `address` | pass through `Address` |
| `agent_address` | `0x` 40-hex | pass through `address` | n/a |
| `publisher_address` | `G…` 56-char | n/a | pass through `Address` |
| `report_hash` | `bytes32` (Stellar) | n/a | `BytesN<32>` `sha256(canonicalReportJson)` |
| `asset_id` | `bytes32` (Stellar) | n/a | `BytesN<32>` `sha256(network_id ++ ":" ++ asset_key)` |

All string identifiers in storage are canonical lower-cased (EVM) or upper-cased (Stellar) before storage. All hashes are 32-byte fixed size. The frontend applies the same canonicalization so contract and indexer events align.

---

## 4. Canonical event taxonomy

The contracts emit normalized events whose parameter names line up with the frontend `transaction_lifecycle_events` table and the `agent_results.raw_signals` shape. Both chains emit the same semantic name and the same field order. Indexers can use a single mapping table.

| Event | Emitted by | When | Topics (indexed) | Data fields |
| --- | --- | --- | --- | --- |
| `AgentApproved` | EVM | owner adds an agent | `wallet`, `agent` | `approvedAt`, `policyHash` |
| `AgentRevoked` | EVM | owner revokes an agent | `wallet`, `previousAgent` | `revokedAt`, `reason` |
| `AgentRotated` | EVM | owner rotates an agent | `wallet`, `previousAgent`, `newAgent` | `rotatedAt`, `policyHash` |
| `PolicyUpdated` | EVM | owner updates rules | `wallet` | `policyHash`, `updatedAt` |
| `DecisionLogged` | EVM | agent logs a decision | `wallet`, `agent` | `decisionHash`, `policyHash`, `decisionId`, `riskScore`, `createdAt` |
| `ExecutionIntentLogged` | EVM | owner logs a signed intent | `wallet`, `intentHash` | `decisionHash`, `expiry`, `nonce` |
| `ExecutionIntentReplayed` | EVM | replay attempt rejected | `intentHash` | `wallet`, `block.timestamp` |
| `ExecutionIntentExpired` | EVM | stale intent surfaced | `wallet`, `intentHash` | `expiry`, `block.timestamp` |
| `EmergencyPauseSet` | EVM | pause toggled | `wallet` | `paused`, `pausedAt`, `reason` |
| `PublisherAuthorizationChanged` | Soroban | admin toggles publisher | `publisher` | `authorized`, `tier`, `changedAt` |
| `PublisherExpired` | Soroban | publisher TTL elapses | `publisher` | `expiredAt`, `lastSeenAt` |
| `RiskPublished` | Soroban | authorized publisher publishes | `asset_id`, `network`, `publisher` | `score`, `verdict`, `report_hash`, `updated_at` |
| `RiskRevoked` | Soroban | admin reverts a risky record | `asset_id`, `network` | `revokedAt`, `reason` |
| `RegistryEmergencyPauseSet` | Soroban | admin toggles pause | n/a | `paused`, `pausedAt`, `reason` |
| `VersionReported` | both | `version()` called | `contract` | `semver`, `buildHash`, `reportedAt` |
| `UpgradeScheduled` | both | admin schedules an upgrade | `contract` | `newImplementationHash`, `effectiveAt`, `delaySec` |
| `UpgradeExecuted` | both | upgrade committed | `contract` | `newImplementationHash`, `executedAt` |

All events MUST be emitted in this order to keep frontend indexers deterministic:

1. `VersionReported` (on first admin call after `initialize` / constructor).
2. `AgentApproved` / `PublisherAuthorizationChanged` (per agent / publisher).
3. `PolicyUpdated` (when policy changes).
4. `DecisionLogged` (per decision).
5. `ExecutionIntentLogged` (per user intent).
6. `RiskPublished` (per registry record).
7. `EmergencyPauseSet` / `RegistryEmergencyPauseSet` (when paused).
8. `UpgradeScheduled`, `UpgradeExecuted` (when an upgrade is in flight).

---

## 5. GoldRaccoonVault (EVM) interface

### 5.1 Storage layout

```solidity
// immutables
address public implementation; // UUPS-style proxy (deployed separately)

// state
address public owner;             // wallet-bound owner
mapping(address => uint256) public agentExpiries; // agent => unix seconds; 0 = unset
mapping(address => bytes32) public policyHash;   // wallet => canonical policy hash
mapping(bytes32 => bool)    public usedIntents;  // intentHash => already submitted
mapping(address => uint256) public nonces;       // wallet => monotonic nonce
bool public paused;

// role bit
uint256 public constant ROLE_AGENT = 1;
```

`agent` is not a single `address` in V2; it is a set of addresses recorded in `agentExpiries`. The current `setAgent` helper emits a deprecation warning and is replaced by `addAgent` / `removeAgent` (see below). The legacy `agent` storage slot is repurposed as a marker for migration completeness.

### 5.2 Roles

| Role | Granted by | Type | Re-issuable |
| --- | --- | --- | --- |
| `owner` | constructor | single address | no — ownership transfer via dedicated two-step `transferOwnership` |
| `agent` | owner | per-address with expiry | yes — owner can add and remove |
| `guardian` | owner (subset) | optional pause authority | yes |

### 5.3 Functions

```solidity
event VersionReported(address indexed contract, uint16 major, uint16 minor, uint16 patch, bytes32 buildHash, uint64 reportedAt);
event AgentApproved(address indexed wallet, address indexed agent, uint64 approvedAt, bytes32 policyHash);
event AgentRevoked(address indexed wallet, address indexed previousAgent, uint64 revokedAt, string reason);
event AgentRotated(address indexed wallet, address indexed previousAgent, address indexed newAgent, uint64 rotatedAt, bytes32 policyHash);
event PolicyUpdated(address indexed wallet, bytes32 indexed policyHash, uint64 updatedAt);
event DecisionLogged(address indexed wallet, address indexed agent, bytes32 indexed decisionHash, bytes32 policyHash, string decisionId, uint16 riskScore, uint64 createdAt);
event ExecutionIntentLogged(address indexed wallet, bytes32 indexed intentHash, bytes32 decisionHash, uint64 expiry, uint256 nonce);
event ExecutionIntentReplayed(bytes32 indexed intentHash, address indexed wallet, uint64 at);
event ExecutionIntentExpired(address indexed wallet, bytes32 indexed intentHash, uint64 expiry, uint64 at);
event EmergencyPauseSet(address indexed wallet, bool paused, uint64 pausedAt, string reason);

error NotOwner();
error NotAgent();
error NotGuardian();
error ZeroAddress();
error ZeroHash();
error Paused();
error Expired();
error Replay();
error InvalidFormat(string reason);
error StaleIntent(uint64 expiry);
error InvalidRiskScore(uint16 actual);

function version() external view returns (uint16 major, uint16 minor, uint16 patch, bytes32 buildHash);

function addAgent(address agent, uint64 expiry) external;                       // onlyOwner
function removeAgent(address agent, string reason) external;                    // onlyOwner
function rotateAgent(address previous, address next, uint64 expiry) external;     // onlyOwner
function setPolicy(bytes calldata policy) external returns (bytes32 policyHash); // onlyOwner; canonical encoding
function getPolicyHash(address wallet) external view returns (bytes32 policyHash);

function logDecision(bytes32 decisionHash, bytes32 policyHash, string calldata decisionId, uint16 riskScore) external; // onlyAgent
function logExecutionIntent(bytes32 intentHash, bytes32 decisionHash, uint64 expiry) external; // onlyOwner

function pause(string reason) external;                                          // owner or guardian
function unpause() external;                                                     // onlyOwner
function transferOwnership(address newOwner) external;                            // onlyOwner, two-step
function acceptOwnership() external;                                              // pendingOwner
function scheduleUpgrade(address newImplementation, uint64 delaySec) external;   // onlyOwner
function executeUpgrade() external;                                               // onlyOwner, after delaySec
```

### 5.4 Validation rules

| Failure | Trigger | Reason |
| --- | --- | --- |
| `NotOwner` | non-owner calls `addAgent`/`setPolicy`/`pause`/`unpause`/`scheduleUpgrade` | ownership bit mismatch |
| `NotAgent` | non-agent calls `logDecision` | agent bit mismatch |
| `NotGuardian` | non-guardian calls `pause`; non-owner calls `unpause` | sub-role mismatch |
| `ZeroAddress` | `address(0)` passed to `addAgent` / `rotateAgent` / `transferOwnership` | canonical zero address |
| `ZeroHash` | decisionHash/intentHash is `bytes32(0)` | reject zero-hash signals |
| `Paused` | any state-changing call when `paused` is true | emergency pause gate |
| `Expired` | `agentExpiries[agent] <= block.timestamp` at agent time | agent lease |
| `InvalidRiskScore` | `riskScore > 100` | score schema |
| `Replay` | `usedIntents[intentHash]` | replay guard |
| `StaleIntent` | `block.timestamp > expiry` | stale intent |
| `InvalidFormat` | decisionId is not UTF-8 or `policy` encoding is incorrect | format validation |

### 5.5 Replay, stale intent, zero-address, invalid hash, pause

- **Replay**: `usedIntents[intentHash]` is set on first `logExecutionIntent`; subsequent calls revert `Replay`. The intent entry is pure data (`intentHash`, `decisionHash`, `expiry`, `nonce`, `wallet`) — no funds move.
- **Stale intent**: any `logExecutionIntent` whose `expiry <= block.timestamp` reverts `StaleIntent`. The frontend computes `expiry` from the V2 transaction lifecycle's `lifecycle.expiresAt` field.
- **Zero address / zero hash**: reverts `ZeroAddress` / `ZeroHash` with no state change.
- **Invalid hash**: `decisionHash` and `intentHash` are `bytes32`. Zero is rejected. Length-checks are unnecessary because the type is fixed-size.
- **Pause**: `EmergencyPauseSet` flips `paused`. `pause` shows in the event before any state change. `pause` accepts zero-length `reason` only if the caller is the guardian; the owner must supply a non-empty reason.

### 5.6 Pause / recovery

- `pause` is idempotent. A second `pause` while paused is a no-op but emits `EmergencyPauseSet(false,…)`. This is required so indexers can see the last caller and timestamp.
- `unpause` requires the owner (not the guardian). The owner must emit `VersionReported` after every `unpause` if the implementation contract changed while paused.
- After `pause`, the contract remains readable (`view` functions still work). The agent cannot `logDecision` while paused; this is intentional.

### 5.7 Upgrade policy

- Storage uses a UUPS proxy pattern (OpenZeppelin `ERC1967Proxy` + `UUPSUpgradeable`).
- `scheduleUpgrade(newImplementation, delaySec)` queues the upgrade; `delaySec` must be ≥ 24 hours and ≤ 30 days.
- `executeUpgrade` is callable only after `effectiveAt <= block.timestamp`. The owner can call `cancelUpgrade` at any time before `executeUpgrade`.
- Both `scheduleUpgrade` and `executeUpgrade` emit `UpgradeScheduled` / `UpgradeExecuted`.
- After every successful upgrade, the implementation must call `version()` and emit `VersionReported` from `initialize` so the route can be discovered.

### 5.8 Frontend correlation

- The frontend `transaction_lifecycle_events` row that already records `submitted` and `confirmed` continues to mirror `intentHash` from the new `ExecutionIntentLogged` event. The frontend uses `decisionHash` from `DecisionLogged` to associate plan records with their audit entry.
- `policyHash` from `PolicyUpdated` is required to mark a `user_rules` row as synced (`user_rules.policy_hash == contract.policyHash(wallet)`).
- `EmergencyPauseSet` and `UpgradeScheduled`/`UpgradeExecuted` are surfaced in the agent timeline and used as veto signals by the Execution Agent.

---

## 6. RiskRegistry (Soroban) interface

### 6.1 Storage layout

```rust
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Initialized,
    Version { major: u32, minor: u32, patch: u32, build_hash: BytesN<32> },
    Paused,
    PauseReason,
    UpgradePending { new_wasm_hash: BytesN<32>, effective_at: u64, proposer: Address },
    UpgradeDelaySec,
    Publisher(Address),
    PublisherTier(Address),
    PublisherExpiry(Address),
    Record(BytesN<32>, Symbol),
    ZeroHash, // sentinel for "no upgrade pending"
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RiskRecordScene {
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
    pub revoked: bool,
    pub revocation_reason: Option<String>,
    pub revocation_admin: Option<Address>,
}
```

`RiskRecord` is extended with `revoked`, `revocation_reason`, `revocation_admin` so the registry can mark a record as reverted without losing its history. The frontend uses `record.revoked` to render the trust badge.

### 6.2 Roles

| Role | Granted by | Type | Re-issuable |
| --- | --- | --- | --- |
| `admin` | `initialize` | single address | yes — two-step `transfer_admin` |
| `publisher` | admin | per-address with tier and expiry | yes |
| `guardian` | admin (subset) | optional pause authority | yes |

### 6.3 Functions

```rust
#[contractevent]
pub struct VersionReported(pub Address /*contract*/, pub u32, pub u32, pub u32, pub BytesN<32>);

#[contractevent]
pub struct RegistryInitialized(pub Address /*admin*/);

#[contractevent]
pub struct RegistryEmergencyPauseSet(pub bool, pub u64, pub String);

#[contractevent]
pub struct PublisherAuthorizationChanged(pub Address, pub bool, pub Symbol /*tier*/, pub u64);

#[contractevent]
pub struct PublisherExpired(pub Address, pub u64, pub u64);

#[contractevent]
pub struct RiskPublished(pub BytesN<32>, pub Symbol, pub Address, pub u32, pub Symbol, pub BytesN<32>, pub u64);

#[contractevent]
pub struct RiskRevoked(pub BytesN<32>, pub Symbol, pub u64, pub String, pub Address /*admin*/);

#[contractevent]
pub struct UpgradeScheduled(pub Address, pub BytesN<32> /*new wasm*/, pub u64, pub u64);

#[contractevent]
pub struct UpgradeExecuted(pub BytesN<32> /*new wasm*/, pub u64);

#[contracterror]
pub enum RegistryError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    UnauthorizedPublisher = 3,
    InvalidScore = 4,
    FutureTimestamp = 5,
    StaleReport = 6,
    ZeroAddress = 7,
    ZeroHash = 8,
    InvalidTier = 9,
    Paused = 10,
    Expired = 11,
    ReplayProtection = 12,
    InvalidUpgradeDelay = 13,
    UpgradeNotPending = 14,
    UpgradeNotReady = 15,
    AdminAlreadyPending = 16,
    InvalidFormat = 17,
}

pub fn initialize(env: Env, admin: Address, publishers: Vec<Address>, tiers: Vec<Symbol>, expiries: Vec<u64>, version: (u32, u32, u32, BytesN<32>));
pub fn set_publisher(env: Env, publisher: Address, authorized: bool, tier: Symbol, expiry: u64);
pub fn publish_risk(env: Env, publisher: Address, asset_id: BytesN<32>, network: Symbol, asset_label: String, score: u32, verdict: Symbol, report_hash: BytesN<32>, evidence_uri: String, updated_at: u64) -> Result<RiskRecord, RegistryError>;
pub fn revoke_risk(env: Env, asset_id: BytesN<32>, network: Symbol, reason: String) -> Result<(), RegistryError>;
pub fn get_risk(env: Env, asset_id: BytesN<32>, network: Symbol) -> Option<RiskRecord>;
pub fn is_publisher(env: Env, publisher: Address) -> bool;
pub fn pause(env: Env, reason: String);
pub fn unpause(env: Env);

pub fn schedule_upgrade(env: Env, new_wasm_hash: BytesN<32>, delay_sec: u64);
pub fn execute_upgrade(env: Env);
pub fn cancel_upgrade(env: Env);

pub fn transfer_admin(env: Env, new_admin: Address);
pub fn accept_admin(env: Env);

pub fn version(env: Env) -> (u32, u32, u32, BytesN<32>);
pub fn admin(env: Env) -> Result<Address, RegistryError>;
pub fn is_paused(env: Env) -> bool;
```

### 6.4 Validation rules

| Failure | Trigger | Reason |
| --- | --- | --- |
| `AlreadyInitialized` | second `initialize` call | state guard |
| `NotInitialized` | any state-changing call before `initialize` | state guard |
| `UnauthorizedPublisher` | publisher missing from storage | auth guard |
| `Expired` | `publisher_expiry <= env.ledger().timestamp()` | publisher lease |
| `InvalidScore` | `score > 100` | schema |
| `FutureTimestamp` | `updated_at > ledger_ts + MAX_FUTURE_SECONDS` | clock guard |
| `StaleReport` | `updated_at <= existing.updated_at` | monotonic guard |
| `ZeroAddress` | publisher or admin is `Address::zero()` | canonical zero |
| `ZeroHash` | `asset_id` or `report_hash` is `BytesN<32>::from_array([0;32])` | sentinel |
| `InvalidTier` | tier symbol length > 32 or numeric | serialization |
| `Paused` | `publish_risk` while `is_paused()` | emergency gate |
| `ReplayProtection` | reserved for future per-publisher nonce on `publish_risk` (V2-066 prerequisite) | see §6.5 |
| `InvalidUpgradeDelay` | `delay_sec < 24 * 3600` or `> 30 * 86400` | upgrade window |
| `UpgradeNotPending` | `execute_upgrade` / `cancel_upgrade` without pending upgrade | state guard |
| `UpgradeNotReady` | `execute_upgrade` before `effective_at` | timelock |
| `AdminAlreadyPending` | `transfer_admin` while another admin transfer is pending | state guard |
| `InvalidFormat` | `asset_label` or `evidence_uri` length > 256 or contains `\u0000` | encoding |

### 6.5 Replay, stale, zero-address, invalid hash, pause

- **Replay**: `publish_risk` checks `updated_at > existing.updated_at`. The V2-066 prerequisite adds a per-publisher monotonic nonce key (`PublisherNonce(publisher)`) that complements `updated_at`. The nonce is checked against `report_hash` in `publish_risk` so a duplicated (publisher, nonce) pair reverts `ReplayProtection`.
- **Stale**: `StaleReport` is already enforced for `publish_risk`. The new `revoke_risk` adds a `revoked_at` and rejects re-revocation with `StaleReport`.
- **Zero address / zero hash**: `ZeroAddress` / `ZeroHash` for the publisher parameter and the `asset_id` / `report_hash` parameters. `revoke_risk` reverts `ZeroHash` on the asset_id.
- **Invalid hash**: `asset_id` and `report_hash` are `BytesN<32>`; zero is rejected. `report_hash` must additionally be `!= sha256(canonicalReportJson) == 0` (effectively a non-zero digit check).
- **Pause**: `pause` / `unpause` are admin (or guardian for `pause`). `publish_risk` and `revoke_risk` revert `Paused` while paused. `get_risk` is always permitted.

### 6.6 Storage / TTL

| Key | TTL constant | Trigger |
| --- | --- | --- |
| `instance` (admin, version, paused, pause reason, upgrade delay, upgrade pending) | `INSTANCE_TTL_THRESHOLD` (30 days) → `INSTANCE_TTL_EXTEND_TO` (120 days) | bumped on every admin or pause write |
| `Publisher(addr)` | `PUBLISHER_TTL_THRESHOLD` (60 days) → `PUBLISHER_TTL_EXTEND_TO` (365 days) | bumped on `set_publisher` and `publish_risk` |
| `PublisherTier(addr)` | same as `Publisher(addr)` | same |
| `PublisherExpiry(addr)` | same as `Publisher(addr)` | same |
| `Record(asset_id, network)` | `RECORD_TTL_THRESHOLD` (60 days) → `RECORD_TTL_EXTEND_TO` (365 days) | bumped on `publish_risk` and `get_risk` |

`MAX_FUTURE_SECONDS` stays at 300. The new `UpgradePending` key uses `UPGRADE_TTL_THRESHOLD` (7 days) → `UPGRADE_TTL_EXTEND_TO` (60 days) so a pending upgrade can survive a temporary outage but cannot linger indefinitely.

### 6.7 Upgrade policy

- `schedule_upgrade(new_wasm_hash, delay_sec)` queues the upgrade. `delay_sec ∈ [24*3600, 30*86400]`. Admins may only schedule one pending upgrade at a time; the second `schedule_upgrade` reverts `UpgradeNotPending`.
- `execute_upgrade` is callable only after `effective_at <= env.ledger().timestamp()`. The implementation must be a Soroban WASM with the same `DataKey` and event taxonomy; otherwise the call reverts with `InvalidFormat`.
- `cancel_upgrade` is callable by the admin at any time before `execute_upgrade`. After `execute_upgrade`, the new instance must call `initialize` only if it is a fresh deployment; otherwise it must call `migrate` with a clean state migration plan (out of scope until the implementation PR).

### 6.8 Frontend correlation

- `RiskPublished` events are correlated to the frontend `riskReport.agentCards[].rawSignals.riskRegistry` field by `(asset_id, network)`.
- `RiskRevoked` sets `record.revoked = true` and surfaces a `Risk Registry Revoked` finding in the agent timeline.
- `RegistryEmergencyPauseSet` flips the `riskRegistry.paused` flag in the runtime-mode health and triggers a manual-review recommendation.

---

## 7. Cross-chain differences

| Concern | EVM (GoldRaccoonVault) | Soroban (RiskRegistry) |
| --- | --- | --- |
| Storage model | contract storage + event log | instance + persistent + TTL |
| Auth model | `owner` / `agent` / `guardian` modifiers + `require_auth` | `require_auth` + storage-level allowlist |
| Replay protection | `usedIntents[intentHash]` mapping | `PublisherNonce` per publisher + `updated_at` monotonic |
| Pause authority | owner or guardian | admin or guardian |
| Pause scope | all state-changing methods | `publish_risk`, `revoke_risk`, `set_publisher` |
| Upgrade | UUPS proxy + `effectiveAt` timelock | versioned WASM + `effectiveAt` timelock |
| Hash encoding | `keccak256` | `sha256` |
| Signature verification | implicit (msg.sender) | `require_auth()` per call |
| Fee model | gas (caller pays) | resource fees (caller pays) |
| Event ordering | constrained by insertion order | constrained by inclusion order |
| Finality | probabilistic (12-15 blocks typical) | deterministic at ledger close |
| Indexer compatibility | subgraph-friendly topis | subquery / Hubble-friendly |

All canonical identifier encodings (decision_id, policy_hash, decision_hash, intent_hash, report_hash) derive from the same labels but use chain-native hash functions. The frontend normalizes them via `frontend/src/lib/chainIdentity.ts`.

---

## 8. Canonical encoding reference

| Field | Type | Canonical encoding |
| --- | --- | --- |
| `decision_id` (EVM) | `bytes32` | `keccak256(abi.encode(uint256(chainId), wallet, decisionCounter))` |
| `decision_id` (Soroban) | `BytesN<32>` | `sha256(network_short_name ++ "\u0000" ++ wallet ++ "\u0000" ++ counter)` |
| `policy_hash` (EVM) | `bytes32` | `keccak256(abi.encode(maxRiskScore, maxTradePercent, maxMemeExposurePercent, maxSlippageBps, allowedChainsHash, blockedTokensHash))` |
| `decision_hash` (EVM) | `bytes32` | `keccak256(abi.encode(decision_id, policy_hash, agent, createdAt, leafSummary))` |
| `intent_hash` (EVM) | `bytes32` | `keccak256(abi.encode(decision_hash, chainId, fromToken, toToken, percent, valueUsd, expiry, nonce))` |
| `asset_id` (Soroban) | `BytesN<32>` | `sha256(network_id ++ ":" ++ asset_key)` |
| `report_hash` (Soroban) | `BytesN<32>` | `sha256(canonicalReportJson)` with `\u0000` separator |

`canonicalReportJson` is the stable-JSON string defined in `frontend/src/server/stellar/riskRegistry.ts` (`canonicalReportJson`).

---

## 9. Migration and deployment plan

### 9.1 Network targets

| Network | Chain | Tier | Status |
| --- | --- | --- | --- |
| GOAT Network (id 48816) | EVM | dev (primary) | await maintainer sign-off |
| Stellar Testnet | Soroban | dev (primary) | await maintainer sign-off |
| Base Sepolia | EVM | dev (secondary, parallel coverage only) | await maintainer sign-off |
| Stellar Pubnet | Soroban | prod | deferred until §9.3 step 6 (third-party audit) |
| Base mainnet | EVM | prod | deferred until §9.3 step 6 (third-party audit) |

The contributor proposes GOAT Network (id 48816) as the primary EVM testnet and Stellar Testnet as the primary Soroban testnet because the existing frontend already exercises the entire V2 transaction lifecycle (`prepare`/`submit`/`confirm`/polling/reject) on these networks. Base Sepolia is kept as a documented secondary testnet; rollout against it begins only after a maintainer approval comment on this PR. Pubnet-equivalent rollouts remain deferred until the third-party audit closes (see §9.3).

### 9.2 Admin key lifecycle

- The deployment admin key is generated per network and stored in a hardware-backed signer (HSM-style or equivalent).
- The admin public key is emitted via `VersionReported` on first `initialize` / `version()` call.
- Two-step `transferOwnership` / `transfer_admin` requires the new admin to call `acceptOwnership` / `accept_admin` within 7 days, otherwise the transfer expires and the admin must call `transferOwnership` again.
- A rotating admin quorum is **not** introduced in this spec; it is a follow-up. The current spec gives a single owner / admin authority.

### 9.3 Step-by-step rollout

1. **Spec sign-off** (this PR) — maintainers approve the spec and target networks.
2. **Testnet deploy** — both contracts deployed to testnet with deterministic admin keys owned by the deployment CI.
3. **Frontend integration PR** — the frontend wires the new `transaction_lifecycle_events` rows to the new contract events; the existing `tx_hash` correlation remains untouched.
4. **Testnet soak** — 14 days of soak testing on testnet with synthetic load and a forced pause / unpause cycle.
5. **Audit** — third-party audit of the implementation PR (out of scope of this spec).
6. **Pubnet deploy** — only after audit, the admin calls `VersionReported`, then `setPublisher` / `addAgent` for the canonical Golden Raccoon publisher / agent.
7. **Frontend cutoff** — the frontend flips `x402Required: true` for non-custodial write paths after the first confirmed event on pubnet.

### 9.4 Cutover and rollback

- The frontend MUST be able to roll back to the V1 contract addresses by swapping the `NEXT_PUBLIC_GOLD_RACCOON_VAULT_ADDRESS` and `NEXT_PUBLIC_RISK_REGISTRY_ADDRESS` env vars.
- The frontend MUST NOT auto-upgrade; every version bump is gated behind a manual `NEXT_PUBLIC_CONTRACT_VERSION` bump and a code-release.

### 9.5 Open questions for maintainer review

The contributor proposes concrete answers inline so the maintainer review can either confirm them in a single approving comment or replace any item with the maintainer's own preference.

1. Confirm the targeted EVM testnet — **proposed**: GOAT Network (id 48816) primary, Base Sepolia documented as secondary (§9.1, §9.6).
2. Confirm the Stellar target — **proposed**: Stellar Testnet dev now, Stellar Pubnet deferred until audit (§9.3).
3. Confirm the UUPS proxy is acceptable for V2 (alternatives: minimal proxy, beacon, or transparent). **proposed**: UUPS, with §5.7 timelock and cancel path.
4. Confirm the upgrade delay window (24h minimum, 30d maximum). **proposed**: 24h minimum, 30d maximum.
5. Confirm the publisher tier list (e.g. `gold_raccoon`, `partner`, `community`). **proposed**: `gold_raccoon`, `partner`, `community`.
6. Confirm the version-rebuild hash encoding (commit SHA-256 truncated to 32 bytes). **proposed**: `sha256(git_commit || build_runner)` truncated to 32 bytes for Soroban; `keccak256(git_commit || build_runner)` truncated to 32 bytes for EVM.
7. Confirm whether the regime requires a publisher quarantine list (out of scope for this spec). **proposed**: deferred — covered by a future V2-068+ spec.

---

## 10. Threats and assumptions

| Threat | Mitigation |
| --- | --- |
| Compromised owner | Two-step ownership transfer; pause available to a separately-held guardian key; upgrade timelock gives time to detect |
| Compromised agent | Per-agent expiry; per-revocation event; replay protection on intents; `Revoked` event is irreversible once `revokedAt` is set |
| Replay of old intent | `usedIntents[intentHash]`; `Replay` revert; `ExecutionIntentReplayed` event for the indexer |
| Stale intent | `StaleIntent` revert; `ExecutionIntentExpired` event for the indexer |
| Compromised admin | Same as compromised owner; admin transfer two-step with `AdminAlreadyPending` guard |
| Soroban eviction | TTL bumps on every write; `RECORD_TTL_THRESHOLD` set to 60 days for records and 120 days for instance |
| RPC provider downtime | `auth` accepts `external` and `app` sources; indexer falls back to RPC providers with `runProviderFallbacks` |
| Network fork | Non-custodial: users always re-sign and resend on the canonical chain; the contract treats each chain_id distinctly |
| Fee / gas changes | `effective_at` allows the user to reissue an intent before the gas changes; replay guard prevents replays |
| Pathological quorum | Out of scope; no quorum is defined in this spec |
| Pause as a means for fund extraction | Pause is a write-only gate; no `transfer` / `approve` / `swap` methods exist; pause cannot move funds |
| Cross-chain replay | EVM hash family is `0x` prefix; Soroban hash family is no prefix; `isTransactionHashForChain` rejects collisions |
| Upgrade with malicious implementation | Timelock + `Version` event + `VersionReported` lets the frontend refuse to follow a new implementation that does not match the expected selector |

### 10.1 Authorization boundaries

- **Owner / Admin** is the only role that can pause, schedule an upgrade, transfer ownership, or set the policy hash. The frontend should surface the latest owner/admin in the agent timeline.
- **Agent / Publisher** is the only role that can log decisions or publish risk. The agent is bound by the policy hash; publishers are bound by the tier and expiry.
- **Guardian** can pause but cannot unpause, set policy, log decisions, or publish risk. This is a defense-in-depth role.
- **Anyone** can read view functions and event log. No role is required for `get_risk`, `version`, `is_publisher`, `is_paused`.

---

## 11. Acceptance criteria mapping

| Issue #16 acceptance criterion | Spec section |
| --- | --- |
| The spec maps every V2 contract requirement to an interface and event. | §2 (gap analysis), §5.3, §6.3, §4 (event taxonomy) |
| EVM and Soroban differences are explicit. | §7 (cross-chain differences) |
| Frontend IDs/hashes have canonical encoding rules. | §3 (frontend identifiers), §8 (canonical encoding reference) |
| Threats, authorization, pause/recovery, and upgrade assumptions are documented. | §10 (threats and assumptions), §5.5, §5.6, §5.7, §6.5, §6.6, §6.7 |
| The test matrix is detailed enough to implement without product guesses. | `docs/V2_CONTRACT_TEST_MATRIX.md` |
| Maintainers explicitly approve the target networks before implementation. | §9.1 (network targets), §9.5 (open questions, including contributor-proposed answers), §9.6 (Base Sepolia secondary testnet) |

The spec is **implementation-ready** once the maintainer approves the open questions in §9.5; the contributor's proposed answers are inline in §9.5 so an approving comment can lock the choices in a single review.

### 9.6 Secondary parallel coverage (Base Sepolia)

- Base Sepolia is documented as the parallel EVM testnet for coverage parity. It is **not** the primary EVM target — GOAT Network (id 48816) is.
- Parity shape if Base Sepolia is signed off (added in a follow-up PR, not this one):
  - `T-EVM-BS-*` tests in `docs/V2_CONTRACT_TEST_MATRIX.md` mirroring every T-EVM row on GOAT Network.
  - Owner-controlled deploy script that pins a deterministic admin and emits `VersionReported` on first call, identical to the GOAT Network path.
  - CI matrix entry that runs the parity suite alongside the GOAT Network suite.
- The Matrix at `docs/V2_CONTRACT_TEST_MATRIX.md` does **not** add Base-Sepolia-only tests in this PR. Test parity for Base Sepolia is a follow-up that requires the maintainer to (a) confirm Base Sepolia as a maintainer-supported secondary, and (b) allocate owner-controlled infrastructure for it.
- If the maintainer does not sign Base Sepolia off in this PR, §9.6 collapses to a single line: "Base Sepolia is not in scope for V2; revisit during the audit phase if needed."

---

## 12. Roadmap to implementation

| Step | Owner | Depends on |
| --- | --- | --- |
| Approve this spec | Maintainer | PR review |
| Implement EVM `GoldRaccoonVault` v2 | Frontend/Contracts | spec approval |
| Implement Soroban `RiskRegistry` v2 | Frontend/Contracts | spec approval |
| Frontend wiring | Frontend | contract deploys |
| Test matrix execution | Frontend | test matrix approval |
| Third-party audit | External | implementation freeze |
| Testnet deploy | DevOps | frontend wiring + audit |
| Pubnet deploy | Maintainer | audit pass + soak |
