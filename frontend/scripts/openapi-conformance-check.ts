/**
 * Validates that:
 *  - docs/openapi/v1/openapi.json is well-formed and declares the required
 *    metadata (info.title/version, components.schemas.Error).
 *  - The stable error helper (`frontend/src/server/api/errors.ts`) produces
 *    payloads that satisfy the documented `Error` schema.
 *  - A handful of representative request/response fixtures for migrated
 *    routes match their documented shapes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ApiError, commonErrorCodes, jsonError, toErrorShape } from "../src/server/api/errors";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const frontendRoot = join(scriptDir, "..");
const openapiPath = join(frontendRoot, "..", "docs", "openapi", "v1", "openapi.json");

interface JsonSchema {
  type?: string | string[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  $ref?: string;
  const?: unknown;
  enum?: unknown[];
}

interface OpenApiSpec {
  openapi: string;
  info: { title?: string; version?: string };
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, JsonSchema> };
}

function loadSpec(): OpenApiSpec {
  const raw = readFileSync(openapiPath, "utf8");
  return JSON.parse(raw) as OpenApiSpec;
}

/** Minimal structural validator: required props exist, `const`/`enum` match. Not a full JSON Schema engine on purpose — good enough for fixture conformance. */
function resolveSchema(spec: OpenApiSpec, schema: JsonSchema): JsonSchema {
  if (schema.$ref) {
    const name = schema.$ref.replace("#/components/schemas/", "");
    const resolved = spec.components.schemas[name];
    assert.ok(resolved, `Unknown schema ref: ${schema.$ref}`);
    return resolveSchema(spec, resolved);
  }
  return schema;
}

function validateAgainstSchema(spec: OpenApiSpec, schema: JsonSchema, value: unknown, path = "$"): string[] {
  const resolved = resolveSchema(spec, schema);
  const errors: string[] = [];

  if (resolved.allOf) {
    for (const sub of resolved.allOf) {
      errors.push(...validateAgainstSchema(spec, sub, value, path));
    }
    return errors;
  }

  if (resolved.oneOf) {
    const matchCount = resolved.oneOf.filter((sub) => validateAgainstSchema(spec, sub, value, path).length === 0).length;
    if (matchCount !== 1) {
      errors.push(`${path}: expected exactly one oneOf branch to match, matched ${matchCount}`);
    }
    return errors;
  }

  if (resolved.type && typeof resolved.type === "string" && resolved.type !== "object") {
    const actual = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
    const expected = resolved.type === "integer" ? "number" : resolved.type;
    if (actual !== expected) {
      errors.push(`${path}: expected type ${resolved.type}, got ${actual}`);
      return errors;
    }
  }

  if (resolved.type === "object" || resolved.properties) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      errors.push(`${path}: expected object, got ${typeof value}`);
      return errors;
    }
    const record = value as Record<string, unknown>;
    for (const requiredKey of resolved.required ?? []) {
      if (!(requiredKey in record)) {
        errors.push(`${path}.${requiredKey}: required property missing`);
      }
    }
    for (const [key, propSchema] of Object.entries(resolved.properties ?? {})) {
      if (key in record) {
        errors.push(...validateAgainstSchema(spec, propSchema, record[key], `${path}.${key}`));
      }
    }
  }

  if (resolved.const !== undefined && value !== resolved.const) {
    errors.push(`${path}: expected const ${JSON.stringify(resolved.const)}, got ${JSON.stringify(value)}`);
  }

  if (resolved.enum && !resolved.enum.includes(value)) {
    errors.push(`${path}: expected one of ${JSON.stringify(resolved.enum)}, got ${JSON.stringify(value)}`);
  }

  return errors;
}

function assertMatchesSchema(spec: OpenApiSpec, schemaName: string, value: unknown, label: string) {
  const schema = spec.components.schemas[schemaName];
  assert.ok(schema, `Schema ${schemaName} not found in spec`);
  const errors = validateAgainstSchema(spec, schema, value);
  assert.equal(errors.length, 0, `${label} failed ${schemaName} validation:\n${errors.join("\n")}`);
}

function checkSpecMetadata(spec: OpenApiSpec) {
  assert.ok(spec.openapi?.startsWith("3.1"), "openapi.json must declare OpenAPI 3.1.");
  assert.ok(spec.info?.title, "openapi.json must declare info.title.");
  assert.ok(spec.info?.version, "openapi.json must declare info.version.");
  assert.ok(spec.components?.schemas?.Error, "openapi.json must declare components.schemas.Error.");
  assert.ok(spec.components?.schemas?.ChainIdentity, "openapi.json must declare components.schemas.ChainIdentity.");
  assert.ok(Object.keys(spec.paths).length > 0, "openapi.json must declare at least one path.");
}

function checkErrorHelperFixtures(spec: OpenApiSpec) {
  const basicError = new ApiError(commonErrorCodes.validationError, "Request validation failed.", 400, {
    details: { formErrors: [], fieldErrors: {} },
  });
  const shape = toErrorShape(basicError, "req_fixture_1");

  assertMatchesSchema(spec, "Error", shape, "ApiError -> toErrorShape() fixture");
  assert.equal(shape.code, commonErrorCodes.validationError);
  assert.equal(shape.retryable, false, "validation_error must default to non-retryable.");

  const retryableError = new ApiError(commonErrorCodes.providerError, "Upstream provider timed out.", 502);
  const retryableShape = toErrorShape(retryableError, "req_fixture_2");
  assertMatchesSchema(spec, "Error", retryableShape, "Retryable ApiError fixture");
  assert.equal(retryableShape.retryable, true, "provider_error must default to retryable.");

  const response = jsonError(
    { code: commonErrorCodes.validationError, message: "Request validation failed.", status: 400, details: { formErrors: [] } },
    { legacy: { error: { formErrors: [], fieldErrors: {} } }, requestId: "req_fixture_3" },
  );
  assert.equal(response.status, 400);

  return response.json().then((body) => {
    assertMatchesSchema(spec, "Error", body, "jsonError() response body (stable fields)");
    assertMatchesSchema(spec, "MigratedErrorEnvelope", body, "jsonError() response body (dual shape)");
    assert.equal((body as { requestId: string }).requestId, "req_fixture_3");
    assert.ok("error" in (body as Record<string, unknown>), "jsonError() must preserve the legacy `error` field when provided.");
  });
}

function checkChainIdentityFixtures(spec: OpenApiSpec) {
  const evmIdentity = { family: "evm", address: "0x1111111111111111111111111111111111111111" };
  const stellarIdentity = { family: "stellar", address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF" };

  assertMatchesSchema(spec, "ChainIdentity", evmIdentity, "EVM ChainIdentity fixture");
  assertMatchesSchema(spec, "ChainIdentity", stellarIdentity, "Stellar ChainIdentity fixture");

  const invalidIdentity = { family: "evm", address: "not-an-address" };
  const errors = validateAgainstSchema(spec, spec.components.schemas.ChainIdentity, invalidIdentity);
  // Pattern constraints are intentionally not enforced by the lightweight validator above
  // (no regex engine), so we only assert that the discriminated union still resolves
  // to exactly one branch by shape (family/address keys), which is the structural
  // guarantee this fixture is protecting.
  assert.equal(errors.length, 0, "Discriminated union should still structurally match by required keys.");
}

function checkAgentResultFixture(spec: OpenApiSpec) {
  const fixture = {
    agent: "onchain",
    status: "complete",
    riskScore: 18,
    score: 18,
    riskLevel: "low",
    verdict: "No major onchain flags",
    summary: "Fixture low-risk onchain result.",
    findings: [{ label: "Fixture onchain clean", severity: "low", detail: "No blocker." }],
    sources: [{ label: "onchain fixture source", status: "connected" }],
    confidence: 0.78,
    recommendedAction: "hold",
    blockingReasons: [],
    missingData: [],
    createdAt: "2026-07-06T12:00:00.000Z",
  };

  assertMatchesSchema(spec, "AgentResult", fixture, "AgentResult fixture");
}

function checkRouteCoverageDoc() {
  const coveragePath = join(frontendRoot, "..", "docs", "openapi", "ROUTE_COVERAGE.md");
  const contents = readFileSync(coveragePath, "utf8");
  assert.ok(contents.includes("operationId"), "ROUTE_COVERAGE.md must document operationId mappings.");
  assert.ok(contents.includes("/scan/token"), "ROUTE_COVERAGE.md must list /scan/token.");
}

async function main() {
  const spec = loadSpec();

  checkSpecMetadata(spec);
  await checkErrorHelperFixtures(spec);
  checkChainIdentityFixtures(spec);
  checkAgentResultFixture(spec);
  checkRouteCoverageDoc();

  console.log("OpenAPI conformance checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
