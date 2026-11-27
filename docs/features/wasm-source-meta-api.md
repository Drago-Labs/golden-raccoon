# Wasm Source Metadata API

## Endpoint

```
POST /api/insights/wasm-source-meta
```

## Request schema

```typescript
{
  contractId: string; // C-prefixed Stellar contract ID
  network: "stellar-testnet" | "stellar-pubnet";
  declaredSources?: Array<{
    field: "repository" | "commit" | "sdkVersion" | "rustVersion" | "buildTool";
    value: string;
    source: string; // citation, e.g. README or release-notes
  }>;
}
```

### Example request

```json
{
  "contractId": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "network": "stellar-testnet",
  "declaredSources": [
    {
      "field": "repository",
      "value": "https://github.com/example/matching-contract",
      "source": "README"
    }
  ]
}
```

## Response schema

```typescript
{
  report: {
    schemaVersion: number;
    contractId: string;
    network: string;
    state: "complete" | "partial" | "unavailable";
    wasmHash: string | null;
    metadata: {
      repository: string | null;
      commit: string | null;
      sdkVersion: string | null;
      rustVersion: string | null;
      buildTool: string | null;
      entries: Array<{ key: string; value: string }>;
      sectionPresent: boolean;
    };
    envMeta: {
      interfaceVersion: string | null;
      sectionPresent: boolean;
    };
    specMeta: {
      entryCount: number | null;
      sectionPresent: boolean;
    };
    comparisons: Array<{
      field: string;
      wasmValue: string | null;
      declaredValue: string | null;
      status: "agreement" | "conflict" | "absent";
      referenceSource: string | null;
    }>;
    compatibility: {
      network: string;
      networkProtocol: string;
      wasmInterfaceVersion: string | null;
      sdkVersion: string | null;
      compatible: boolean | null;
      notes: string;
    };
    coverageNotice: string;
    readOnly: boolean;
  }
}
```

## Status codes

- **200**: Report produced
- **400**: Invalid request or contract ID
- **404**: Contract Wasm not found
- **413**: Payload or Wasm too large
- **429**: Rate limit exceeded
- **503**: Provider unavailable (`Retry-After` set)

## Error codes

- `invalid_json`
- `invalid_request`
- `invalid_contract`
- `not_found`
- `payload_too_large`
- `response_too_large`
- `provider_unavailable`
- `wasm_source_meta_failed`
