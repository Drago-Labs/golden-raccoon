import { boolean, shape, text } from "./validation.js";
import type { Transport } from "./transport.js";
import type { ReadOptions } from "./types.js";
export const healthSchema = shape({ ok: boolean, service: text, checkedAt: text, mockFallbacksEnabled: boolean, liveModeUsesMockData: boolean });
export type Health = ReturnType<typeof healthSchema>;
export const healthClient = (get: Transport) => ({ get: (options?: ReadOptions) => get("/api/health", {}, healthSchema, options) });
