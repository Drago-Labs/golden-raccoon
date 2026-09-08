export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeTracing } = await import("@/server/observability/tracing/setup");
    await initializeTracing();
  }
}
