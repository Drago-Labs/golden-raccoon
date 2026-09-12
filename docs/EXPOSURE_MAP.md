# Portfolio Shared Exposure Map Architecture & Specification

## Executive Summary

The Portfolio Shared Exposure Map addresses hidden systemic risk across decentralized portfolios. While single-chain balances appear distinct, multiple assets frequently depend on identical centralized issuers (e.g., Circle issuing USDC on Ethereum and Stellar), shared decentralized liquidity protocols (e.g., Aave, Curve, Uniswap pools), or identical underlying collateral (e.g., wstETH backed by stETH backed by ETH).

This system builds a canonical directed graph across holdings, traverses transitive dependency chains with strict cycle-detection guards, partitions direct versus look-through exposures, and computes concentration metrics including the Herfindahl-Hirschman Index (HHI).

## System Architecture

```
[Portfolio Holdings Source]
           │
           ▼
 [Holdings Normalization] ─── Canonical Identity Key: `${network}:${family}:${address}`
           │
           ▼
[Relationship Ingestion Engine] ◄── [Custom Relationship Overrides & Built-in Mapping]
           │
           ▼
[Directed Graph Builder & Cycle Neutralizer] ─── Tarjan's SCC & Depth-Bounded Traversal
           │
           ▼
[Allocation & Concentration Engine] ─── Decimal Math, Direct vs Look-through, HHI
           │
           ▼
[API Route & Interactive UI Workbench] ─── Graph View, Table View, Inspector, Risk Panels
```

## Canonical Entity Identity Model

To prevent cross-network collisions and preserve multi-chain isolation, all assets and dependencies adhere to strict naming conventions:

| Entity Type | Identifier Format | Example |
| :--- | :--- | :--- |
| Network Asset | `${network}:${family}:${address}` | `ethereum:evm:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` |
| Stellar Asset | `stellar-pubnet:stellar:${assetCode}:${issuer}` | `stellar-pubnet:stellar:USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` |
| Native Asset | `${network}:${family}:native` | `ethereum:evm:native` |
| Shared Issuer | `issuer:${issuer_slug}` | `issuer:circle`, `issuer:tether` |
| Shared Protocol | `protocol:${protocol_slug}` | `protocol:aave-v3`, `protocol:lido` |
| Underlying Asset | `underlying:${underlying_slug}` | `underlying:eth`, `underlying:usdc` |

## Mathematical & Concentration Formulas

### Herfindahl-Hirschman Index (HHI)

The Herfindahl-Hirschman Index measures concentration risk across identified counterparty entities:

$$\text{HHI} = \sum_{i=1}^{N} (s_i)^2$$

Where:
- $s_i$ is the percentage market share of exposure attributable to entity $i$ (expressed as a number from $0$ to $100$).
- If total portfolio value is $0$, HHI defaults to $0$.

### Classification Thresholds

| HHI Range | Classification | Risk Implications |
| :--- | :--- | :--- |
| $\text{HHI} < 1500$ | Diversified | Healthy distribution across multiple counterparties |
| $1500 \le \text{HHI} \le 2500$ | Moderately Concentrated | Moderate dependence on specific entities |
| $\text{HHI} > 2500$ | Highly Concentrated | Significant vulnerability to single-entity impairment |

### Dominant Entity Threshold

Any entity whose aggregate direct and look-through exposure accounts for more than 25% of total portfolio value is flagged as a dominant risk factor.

## Cycle Guard Algorithm

Complex DeFi structures often exhibit circular wrapping or multi-hop routing (e.g., A wraps into B, B into C, C back into A). To prevent infinite loops or double-counting:

1. **Detection**: Graph edges undergo Tarjan's strongly connected components (SCC) analysis and DFS back-edge detection.
2. **Neutralization**: Any back-edge creating a directed cycle is severed from allocation traversal and recorded in the `cycles` audit list.
3. **Depth Bounding**: Traversal terminates at a hard maximum depth of 10 hops.
4. **Audit Reporting**: Severed cyclic relationships are flagged in API outputs and visually highlighted in the UI warning banner.

## Precision & Safe Arithmetic

To prevent floating-point inaccuracies when aggregating large institutional positions or micro-dust balances:
- All financial aggregation uses integer arithmetic and bounded float rounding via `safeUsd` (2 decimal places) and `safeDecimal` (6 decimal places).
- Values are clamped to $0$ to prevent negative allocation artifacts from rounding drift.
- Unpriced assets are tracked in `CoverageGaps` rather than treated as zero-value, ensuring transparent portfolio coverage statistics.

## API Specification

### GET `/api/insights/exposure-map`

Read-only retrieval of the current portfolio exposure map.

#### Query Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `walletAddress` | `string` | No | Optional wallet address filter |
| `chain` | `string` | No | Optional chain filter (`ethereum`, `stellar`, etc.) |

#### Response Headers

- `Cache-Control: no-store, no-cache, must-revalidate`
- `X-Content-Type-Options: nosniff`

### POST `/api/insights/exposure-map`

Computation endpoint accepting custom portfolio holdings and relationship override rules.

#### Request Body

```json
{
  "walletAddress": "0x123...",
  "chain": "ethereum",
  "holdings": [
    {
      "network": "ethereum",
      "address": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "symbol": "USDC",
      "balance": 10000,
      "priceUsd": 1.0,
      "valueUsd": 10000
    }
  ],
  "customRelationships": [
    {
      "sourceAssetKey": "ethereum:evm:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "targetEntityId": "issuer:circle",
      "relationshipType": "issuer",
      "allocationPercentage": 100
    }
  ]
}
```

## User Interface Components

The exposure map workbench is organized under `frontend/src/components/research/exposure-map/`:

- `ExposureMap`: Master dashboard container with summary metrics, view toggles, and cycle banners.
- `ExposureGraph`: Directed visual dependency graph highlighting holdings, issuers, protocols, and edge weights.
- `DependencyTable`: Searchable, filterable tabular breakdown of exposure shares, direct vs. look-through values, and underlying asset lists.
- `ConcentrationPanel`: HHI score visualization, concentration tier badges, and dominant entity alerts.
- `CoveragePanel`: Data completeness statistics, unpriced asset counts, and unmapped dependency alerts.
