import type { AgentSource } from "@/server/types";

export type RuntimeMode = "live" | "demo" | "test";

export function getRuntimeMode(): RuntimeMode {
  const configuredMode = (process.env.APP_MODE ?? process.env.NEXT_PUBLIC_APP_MODE ?? "").trim().toLowerCase();

  if (configuredMode === "demo") return "demo";
  if (configuredMode === "test" || process.env.NODE_ENV === "test") return "test";

  return "live";
}

export function getRuntimeModeHealth() {
  const mode = getRuntimeMode();

  return {
    mode,
    liveModeUsesMockData: false,
    demoModeClearlyMarked: mode === "demo",
    testsMayUseMockSources: mode === "test",
  };
}

export function assertNoMockSourcesInLive(sources: AgentSource[]) {
  if (getRuntimeMode() !== "live") {
    return;
  }

  const mockSource = sources.find((source) => source.status === "mock");

  if (mockSource) {
    throw new Error(`Live mode cannot return mock source data: ${mockSource.label}`);
  }
}
