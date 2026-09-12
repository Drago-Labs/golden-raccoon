import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import { commonErrorCodes } from "../src/server/api/errors";

const validCodes = new Set(Object.values(commonErrorCodes));
const extraAllowed = new Set([
  "chain_family_mismatch",
  "invalid_wallet",
  "invalid_source",
  "source_wallet_mismatch",
  "approval_required",
  "hash_chain_family_mismatch",
  "network_chain_family_mismatch",
  "transaction_not_found",
  "submit_failed",
  "stellar_disabled",
  "invalid_payment_proof",
  "payment_proof_rejected",
  "duplicate_payment",
  "expected_effects_mismatch",
  "incident_mode",
  "not_found",
  "session_superseded",
  "session_revoked",
  "session_expired",
  "device_binding_mismatch",
  "nonce_already_used",
  "nonce_address_mismatch",
  "nonce_expired"
]);

const ALL_VALID_CODES = new Set([...validCodes, ...extraAllowed]);

const ROUTE_FILES = [
  "src/app/api/scan/token/route.ts",
  "src/app/api/execute/quote/route.ts",
  "src/app/api/execute/prepare/route.ts",
  "src/app/api/execute/submit/route.ts",
  "src/app/api/x402/deep-scan/route.ts",
  "src/app/api/x402/stellar-deep-scan/route.ts"
].map(f => path.resolve(__dirname, "..", f));

function validateFile(filePath: string, program: ts.Program) {
  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) {
    throw new Error(`Could not find source file ${filePath}`);
  }

  let hasErrors = false;

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "jsonError"
    ) {
      const args = node.arguments;
      if (args.length > 0 && ts.isObjectLiteralExpression(args[0])) {
        const obj = args[0];
        const codeProp = obj.properties.find(
          (p) =>
            ts.isPropertyAssignment(p) &&
            ts.isIdentifier(p.name) &&
            p.name.text === "code"
        ) as ts.PropertyAssignment | undefined;

        if (codeProp) {
          let codeValue = "";
          if (ts.isStringLiteral(codeProp.initializer)) {
            codeValue = codeProp.initializer.text;
          } else if (
            ts.isAsExpression(codeProp.initializer) &&
            ts.isStringLiteral(codeProp.initializer.expression)
          ) {
            codeValue = codeProp.initializer.expression.text;
          } else if (
            ts.isAsExpression(codeProp.initializer) &&
            ts.isIdentifier(codeProp.initializer.expression)
          ) {
            // it's a dynamic variable, we can't easily statically verify
            return;
          } else if (ts.isIdentifier(codeProp.initializer)) {
            return;
          }

          if (codeValue && !ALL_VALID_CODES.has(codeValue)) {
            console.error(`Invalid error code "${codeValue}" found in ${filePath}`);
            hasErrors = true;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return !hasErrors;
}

function runCheck() {
  const program = ts.createProgram(ROUTE_FILES, {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    allowJs: true
  });

  let allPassed = true;
  for (const file of ROUTE_FILES) {
    if (!validateFile(file, program)) {
      allPassed = false;
    }
  }

  if (allPassed) {
    console.log("Static error taxonomy conformance check passed!");
    process.exit(0);
  } else {
    console.error("Static error taxonomy conformance check failed.");
    process.exit(1);
  }
}

runCheck();
