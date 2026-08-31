export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startRuntimeProfiler } = await import(
    "@/lib/server/runtimeProfiler/runtime"
  );
  startRuntimeProfiler();
}
