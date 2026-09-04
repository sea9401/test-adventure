import { ensureUser } from "@/lib/server/ensureUser";
import { readGuildRaidState } from "@/lib/server/guildRaidRead";

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const result = await readGuildRaidState(userId, new Date(), {
    leaderboardPage: url.searchParams.get("leaderboardPage") ?? 1,
    recentPage: url.searchParams.get("recentPage") ?? 1,
  });
  if (!result.ok) {
    const status = result.error === "no_guild" ? 403 : 500;
    return Response.json(result, { status });
  }
  return Response.json(result);
}
