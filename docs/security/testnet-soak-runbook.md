# Testnet Soak Test Runbook

> Purpose: Validate production readiness by running a sustained soak on testnet (Sepolia / Stellar Testnet) for 48 hours.
> Frequency: Before each mainnet release candidate.
> Duration: 48 hours minimum.

## Prerequisites

- [ ] Testnet RPC endpoints configured in `.env.local`
- [ ] Testnet policy contract deployed (EVM + Stellar)
- [ ] Testnet vault contract deployed (EVM + Stellar)
- [ ] Frontend deployed to staging environment
- [ ] Monitoring dashboard configured (see Runbook: Monitoring)
- [ ] Load-test scripts ready (`scripts/load-test-simulation.mjs`, `scripts/load-test-execution.mjs`)
- [ ] Alerting destination configured (Slack/PagerDuty, see Runbook: Alerting)
- [ ] Test wallet funded with testnet tokens (Sepolia ETH, Stellar test XLM)

## Execution

### Phase 1: Baseline (T-minus 2 hours)

```bash
# 1. Record baseline metrics
curl http://localhost:3000/api/health

# 2. Verify all endpoints respond
node scripts/load-test-simulation.mjs 1 5 http://localhost:3000
node scripts/load-test-execution.mjs 1 5 http://localhost:3000
```

### Phase 2: Sustained Load (T-minus 48 hours)

Run the following from a stable host (not your workstation):

```bash
# Terminal 1: Simulation load (10 concurrent, 1 req/s sustained)
while true; do
  node scripts/load-test-simulation.mjs 10 100 http://localhost:3000
  sleep 60
done

# Terminal 2: Execution load (5 concurrent, intermittent)
for i in $(seq 1 20); do
  node scripts/load-test-execution.mjs 5 50 http://localhost:3000
  sleep 300
done
```

Alternatively, use `load-test-harness.mjs` (if created) for orchestrated runs.

### Phase 3: Monitoring

| Metric | Check interval | Alert threshold | Action |
|---|---|---|---|
| P95 latency (simulate) | 5 minutes | > 5000ms | Investigate bottleneck |
| P95 latency (execute) | 5 minutes | > 10000ms | Scale or investigate |
| Error rate | 5 minutes | > 5% | Page on-call |
| RPC success rate | 5 minutes | < 95% | Rotate RPC endpoint |
| Memory usage | 15 minutes | > 80% of limit | Scale horizontally |
| CPU usage | 15 minutes | > 70% sustained | Scale horizontally |

### Phase 4: Wrap-up

```bash
# After 48 hours
# 1. Archive logs
cp -r /var/log/app logs/soak-$(date +%Y%m%d-%H%M)

# 2. Record final metrics
curl http://localhost:3000/api/health

# 3. Generate summary
node scripts/load-test-simulation.mjs 1 10 http://localhost:3000 > soak-final-check.txt
```

## Success Criteria

- [ ] Error rate < 2% over 48 hours
- [ ] P95 simulation latency < 3000ms
- [ ] P95 execution latency < 8000ms
- [ ] No crash, OOM, or unrecoverable error
- [ ] All testnet transactions confirmed within expected time
- [ ] Alerting fired correctly for intentional failure injection (if done)

## Failure Modes

| Symptom | Likely Cause | Mitigation |
|---|---|---|
| Increasing latency (simulate) | RPC rate limit hit | Rotate RPC keys, reduce concurrency |
| Increasing latency (execution) | Policy contract gas spikes | Adjust gas limit, check contract for loops |
| Error rate spike 5xx | Upstream RPC down | Failover to secondary RPC |
| Memory leak | Unclosed DB connections | Restart process, investigate leak |
| Stale cache | Cache TTL too long | Reduce cache TTL, verify invalidation |
