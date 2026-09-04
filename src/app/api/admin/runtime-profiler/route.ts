import { requireAdmin } from "@/lib/server/isAdmin";
import { getEconomyEventBatchMetrics } from "@/lib/server/economyLog";
import { getRuntimeProfilerSnapshot } from "@/lib/server/runtimeProfiler/runtime";

export async function GET() {
  const gate = await requireAdmin();
  if (gate) return gate;

  return Response.json({
    ...getRuntimeProfilerSnapshot(),
    economyEventBatch: getEconomyEventBatchMetrics(),
  });
}
