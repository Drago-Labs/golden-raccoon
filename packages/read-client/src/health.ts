import { boolean, shape, text } from "./validation.js";
import type { Transport } from "./transport.js";
import type { ReadOptions } from "./types.js";
export const healthSchema = shape({ ok: boolean, service: text, checkedAt: text, mockFallbacksEnabled: boolean, liveModeUsesMockData: boolean });
export type Health = ReturnType<typeof healthSchema>;
/**
 * Creates the health resource client.
 *
 * @param get Transport function.
 * @returns Object exposing health query methods.
 */
export const healthClient = (get: Transport) => ({ get: (options?: ReadOptions) => get("/api/health", {}, healthSchema, options) });
