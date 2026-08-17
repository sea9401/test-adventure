import { requireCronAuth } from "@/lib/server/cronAuth";
import { rolloverGuildRaids } from "@/lib/server/guildRaidLifecycle";

export async function GET(req: Request) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  const result = await rolloverGuildRaids();
  return Response.json({ ok: true, ...result });
}
