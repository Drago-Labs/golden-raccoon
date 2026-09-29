/**
 * Operator gate for schema-drift reports.
 *
 * Requires `x-operator-token` matching `PROVIDER_DRIFT_OPERATOR_TOKEN`.
 * When the env token is unset, only the explicit test bypass header
 * `x-operator-test: 1` is accepted in non-production — never open by default.
 */
export function authorizeOperator(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.PROVIDER_DRIFT_OPERATOR_TOKEN?.trim();
  const provided = request.headers.get("x-operator-token")?.trim();

  if (expected) {
    if (provided && provided === expected) return { ok: true };
    return { ok: false, status: 401, error: "operator_unauthorized" };
  }

  const allowTest = process.env.NODE_ENV !== "production" && request.headers.get("x-operator-test") === "1";
  if (allowTest) return { ok: true };

  return { ok: false, status: 401, error: "operator_unauthorized" };
}
