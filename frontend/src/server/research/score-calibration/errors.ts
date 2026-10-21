/**
 * Typed error for the score calibration report — see
 * `frontend/src/server/research/policy-changes/errors.ts` for the
 * established sibling pattern this mirrors.
 */
export class ScoreCalibrationError extends Error {
  constructor(
    readonly code: "invalid_request" | "payload_too_large",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ScoreCalibrationError";
  }
}
