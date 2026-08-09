import { requireAdmin } from "@/lib/server/isAdmin";
import { getRuntimeProfilerSnapshot } from "@/lib/server/runtimeProfiler/runtime";

export async function GET() {
  const gate = await requireAdmin();
  if (gate) return gate;

  return Response.json(getRuntimeProfilerSnapshot());
}
