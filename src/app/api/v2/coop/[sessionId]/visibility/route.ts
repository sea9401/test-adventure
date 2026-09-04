import { eq } from "drizzle-orm";
import { db } from "@/db";
import { coopBossSessions } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  COOP_BOSSES,
  COOP_VISIBILITY_VALUES,
  coopVisibilityTransition,
  parseCoopBossKindId,
  type CoopVisibility,
} from "@/adventure/data/v2/coopBosses";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { broadcastCoopNotice } from "@/lib/server/v2Coop";
import { insertFeedEntry } from "@/lib/server/serverFeed";

type Ctx = { params: Promise<{ sessionId: string }> };

// POST /api/v2/coop/[sessionId]/visibility — 소환자가 소환 "후" 공개 범위 변경.
//   흐름: 나만/길드원만으로 소환해 기여 보상을 쌓은 뒤 모두에게 공개해 함께 잡기.
//   public 전환은 단방향 — 공개 뒤에는 나만/길드원만으로 되돌릴 수 없다.
//   소환자(summonerId) 전용·활성 세션만. 길드원만 강등(길드 없음→나만)은 소환 로직과 동일.
export async function POST(req: Request, { params }: Ctx) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { sessionId } = await params;
  let body: { visibility?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (
    typeof body.visibility !== "string" ||
    !COOP_VISIBILITY_VALUES.includes(body.visibility as CoopVisibility)
  ) {
    return Response.json(
      { ok: false, error: "bad_visibility" },
      { status: 400 },
    );
  }
  const requested = body.visibility as CoopVisibility;

  type Publication = {
    kind: NonNullable<ReturnType<typeof parseCoopBossKindId>>;
    expiresAt: number;
    bossName: string;
    summonerName: string;
  };
  const result = await db.transaction(async (tx) => {
    // FOR UPDATE — 동시 attack(처치 CAS)과 직렬화. 잠근 뒤 ended 판정해야 처치 직후 변경 race 차단.
    const [session] = await tx
      .select()
      .from(coopBossSessions)
      .where(eq(coopBossSessions.id, sessionId))
      .for("update");
    if (!session) {
      return {
        status: 404,
        body: { ok: false, error: "no_session" },
        publication: null as Publication | null,
      };
    }
    // 소환자만 변경 가능.
    if (session.summonerId !== userId) {
      return {
        status: 403,
        body: { ok: false, error: "not_owner" },
        publication: null as Publication | null,
      };
    }
    const sessionKind = parseCoopBossKindId(session.regionId);
    if (sessionKind && COOP_BOSSES[sessionKind].visibilityLocked) {
      return {
        status: 409,
        body: { ok: false, error: "visibility_locked" },
        publication: null as Publication | null,
      };
    }
    // 활성 세션만 — 처치/만료된 토벌은 변경 의미 없음.
    const ended =
      (session.defeatedAt !== null && session.hp <= 0) ||
      session.expiresAt.getTime() <= Date.now();
    if (ended) {
      return {
        status: 400,
        body: { ok: false, error: "not_active" },
        publication: null as Publication | null,
      };
    }
    const transition = coopVisibilityTransition(session.visibility, requested);
    if (!transition.ok) {
      return {
        status: 409,
        body: { ok: false, error: transition.error },
        publication: null as Publication | null,
      };
    }
    // 길드원만 → 현재 길드로 재스냅샷(변경 시점 기준). 길드 없으면 '나만'으로 강등(소환과 동일).
    let storedVisibility = requested;
    let summonerGuildId = session.summonerGuildId;
    if (requested === "guild_only") {
      const myGuildId = await getGuildId(tx, userId);
      if (myGuildId == null) storedVisibility = "summoner_only";
      else summonerGuildId = myGuildId;
    }
    const storedTransition = coopVisibilityTransition(
      session.visibility,
      storedVisibility,
    );
    if (!storedTransition.ok) {
      return {
        status: 409,
        body: { ok: false, error: storedTransition.error },
        publication: null as Publication | null,
      };
    }
    if (storedTransition.changed) {
      await tx
        .update(coopBossSessions)
        .set({ visibility: storedVisibility, summonerGuildId })
        .where(eq(coopBossSessions.id, sessionId));
    }
    const kind = parseCoopBossKindId(session.regionId);
    const publication =
      storedTransition.changed && storedVisibility === "public" && kind
        ? {
            kind,
            expiresAt: session.expiresAt.getTime(),
            bossName: session.bossName,
            summonerName: session.summonedByName?.trim() || "모험가",
          }
        : null;
    return {
      status: 200,
      body: {
        ok: true,
        visibility: storedVisibility,
        changed: storedTransition.changed,
      },
      publication,
    };
  });

  if (result.publication) {
    await insertFeedEntry(userId, "coop_summon", {
      kind: result.publication.kind,
      sessionId,
      expiresAt: result.publication.expiresAt,
    });
    await broadcastCoopNotice(
      `${result.publication.summonerName} 님이 「${result.publication.bossName}」 토벌을 전체 공개했다`,
    );
  }
  return Response.json(result.body, { status: result.status });
}
