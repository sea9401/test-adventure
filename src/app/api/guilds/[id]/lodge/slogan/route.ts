import { ensureUser } from "@/lib/server/ensureUser";
import { setSlogan } from "@/lib/server/guildLodge";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const { id: idStr } = await params;
  const guildId = Number(idStr);
  if (!Number.isInteger(guildId) || guildId <= 0) {
    return new Response("invalid id", { status: 400 });
  }

  let body: { slogan?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  if (typeof body.slogan !== "string") {
    return new Response("slogan required", { status: 400 });
  }

  try {
    const result = await setSlogan(guildId, userId, body.slogan);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status });
    }
    return Response.json(result.data);
  } catch (e) {
    console.error("[guilds.lodge.slogan.PATCH] ", e);
    return new Response("internal error", { status: 500 });
  }
}
