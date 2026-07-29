# Rollback Procedure

> **Owner**: Lead Maintainer (on-call)
> **Goal**: Restore service within 15 minutes of a failed deployment.

## Prerequisites

- [ ] Previous known-good build hash archived (see `docs/security/hash-freeze-procedure.md`)
- [ ] Previous contract addresses documented
- [ ] Database backup available (if applicable)
- [ ] DNS TTL set to 300s or lower before deploy

## Rollback triggers (any of the following)

- Error rate > 5% sustained over 5 minutes
- P95 latency > 10x baseline for 10 minutes
- Contract interaction failures or revert rates > 2%
- x402 payment provider integration failures
- Security incident (reported or detected)
- Vulnerability discovered post-deploy

## Immediate actions (first 5 minutes)

### 1. Stop further traffic (if rapid rollback needed)

**Option A: DNS rollback**
```
# Point to previous deployment's IP/CDN
# DNS TTL already lowered, so propagation is fast
# Update A/AAAA records or CDN origin
```

**Option B: Feature flag / kill switch**
```
# If feature-flagged: disable release flag
# UI shows maintenance page via reverse proxy
```

### 2. Revert infrastructure

**If deployment was through CI/CD pipeline:**
```bash
# Vercel
vercel rollback

# Railway / Render
# Use platform rollback to previous deployment

# GitHub Pages / static hosting
git revert HEAD --no-edit
git push origin main
```

### 3. Revert contracts (only if state-breaking)

> ⚠️ Alert: Contracts on mainnet CANNOT be rolled back. This section covers emergency
> measures, NOT true rollback.

**EVN contracts:**
- Use `emergencyPause()` on policy contract to halt policy checks
- All vaults will reject deposits/withdrawals (fail-closed)

```solidity
// Call from admin address
policy.emergencyPause();
vault.emergencyPause();
```

**Soroban contracts:**
```rust
// Call from admin address
policy_client.emergency_pause(&env.current_contract_address());
vault_client.emergency_pause();
```

**If a re-deploy is necessary:**
```bash
# Deploy new policy contract
npx hardhat run scripts/deploy-policy.js --network mainnet

# Point vaults to new policy address (not possible for non-upgradeable vaults)
# Alternative: Deploy new vault and migrate assets
# ⚠️ Migration requires asset transfer, which requires user cooperation
```

### 4. Communicate

- [ ] Update status page (if exists)
- [ ] Post in internal incident channel
- [ ] (Optional) Post in user-facing channel if outage > 5 minutes

## Post-rollback (after service restored)

### Root cause analysis

| Step | Owner | Deadline |
|---|---|---|
| Document what went wrong | Lead maintainer | 24h post-incident |
| Create issue for fix | Lead maintainer | 24h post-incident |
| Implement fix | Assigned engineer | Per priority |
| Test fix on testnet | Assigned engineer | Before next deploy |
| Update testnet soak runbook | Assigned engineer | Before next deploy |

### Contract-specific incident

If the contract itself had a vulnerability:
1. [ ] Contact users whose funds are at risk (if any)
2. [ ] Work with auditors on emergency patch
3. [ ] Coordinate new deploy with asset migration plan
4. [ ] Publish post-mortem

## Testing the rollback procedure

- Run the procedure quarterly on testnet
- Time the rollback — must complete within 15 minutes
- Document and address any step that takes > 5 minutes
