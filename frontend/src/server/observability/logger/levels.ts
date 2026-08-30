export type LogLevel = "debug" | "info" | "warn" | "error";

export const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function parseLogLevel(value?: string | null): LogLevel {
  const env = (value ?? process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug")).toLowerCase();
  if (env === "debug") return "debug" as LogLevel;
  if (env === "info") return "info" as LogLevel;
  if (env === "warn") return "warn" as LogLevel;
  return "error" as LogLevel;
}
