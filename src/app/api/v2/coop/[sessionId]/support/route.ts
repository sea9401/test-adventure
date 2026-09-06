import { eq } from "drizzle-orm";
import { db } from "@/db";
import { coopBossSessions } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";

type Ctx = { params: Promise<{ sessionId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const userId = await ensureUser();
  if (!userId)
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: { allowFreeSupport?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body.allowFreeSupport !== "boolean") {
    return Response.json(
      { ok: false, error: "bad_support_setting" },
      { status: 400 },
    );
  }
  const allowFreeSupport = body.allowFreeSupport;
  const { sessionId } = await params;
  const result = await db.transaction(async (tx) => {
    // 공격의 잠금 후 허용 검사와 직렬화한다.
    const [session] = await tx
      .select()
      .from(coopBossSessions)
      .where(eq(coopBossSessions.id, sessionId))
      .for("update");
    if (!session)
      return { status: 404, body: { ok: false, error: "no_session" } };
    if (session.summonerId !== userId)
      return { status: 403, body: { ok: false, error: "not_owner" } };
    if (
      session.defeatedAt !== null ||
      session.hp <= 0 ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      return { status: 409, body: { ok: false, error: "not_active" } };
    }
    await tx
      .update(coopBossSessions)
      .set({ allowFreeSupport })
      .where(eq(coopBossSessions.id, sessionId));
    return { status: 200, body: { ok: true, allowFreeSupport } };
  });
  return Response.json(result.body, { status: result.status });
}
