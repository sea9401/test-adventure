import { ensureUser } from "@/lib/server/ensureUser";
import { upgradeRank } from "@/lib/server/guildLodge";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const { id: idStr } = await params;
  const guildId = Number(idStr);
  if (!Number.isInteger(guildId) || guildId <= 0) {
    return new Response("invalid id", { status: 400 });
  }

  try {
    const result = await upgradeRank(guildId, userId);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status });
    }
    return Response.json(result.data);
  } catch (e) {
    console.error("[guilds.lodge.upgrade.POST] ", e);
    return new Response("internal error", { status: 500 });
  }
}
