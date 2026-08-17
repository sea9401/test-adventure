import { ensureUser } from "@/lib/server/ensureUser";
import { readGuildRaidState } from "@/lib/server/guildRaidRead";

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const result = await readGuildRaidState(userId);
  if (!result.ok) {
    const status = result.error === "no_guild" ? 403 : 500;
    return Response.json(result, { status });
  }
  return Response.json(result);
}
