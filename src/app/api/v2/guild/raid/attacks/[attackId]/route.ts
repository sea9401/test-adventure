import { ensureUser } from "@/lib/server/ensureUser";
import { readGuildRaidReplay } from "@/lib/server/guildRaidRead";

type Ctx = { params: Promise<{ attackId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { attackId: rawAttackId } = await params;
  if (!/^\d+$/.test(rawAttackId)) {
    return Response.json({ ok: false, error: "no_attack" }, { status: 404 });
  }
  const attackId = Number(rawAttackId);
  if (!Number.isSafeInteger(attackId) || attackId <= 0) {
    return Response.json({ ok: false, error: "no_attack" }, { status: 404 });
  }
  const result = await readGuildRaidReplay(userId, attackId);
  if (!result) {
    return Response.json({ ok: false, error: "no_attack" }, { status: 404 });
  }
  return Response.json({ ok: true, ...result });
}
