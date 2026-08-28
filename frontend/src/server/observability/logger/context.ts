import { AsyncLocalStorage } from "async_hooks";

type LoggerContext = {
  correlationId: string;
  module?: string;
};

const als = new AsyncLocalStorage<LoggerContext>();

export function runWithContext<T>(ctx: LoggerContext, fn: () => T): T {
  return als.run(ctx, fn);
}

export function getContext(): LoggerContext | undefined {
  return als.getStore();
}

export function getCorrelationId(): string | undefined {
  return als.getStore()?.correlationId;
}

export function setModuleName(name: string) {
  const store = als.getStore();
  if (store) store.module = name;
}
