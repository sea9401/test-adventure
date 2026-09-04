import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import { createCoopBossSession } from "@/lib/server/v2Coop";
import {
  COOP_BOSSES,
  COOP_INITIAL_VISIBILITY,
  SUMMON_SCROLL_MATERIAL_ID,
  isScrollSummonableCoopBossKind,
  parseCoopBossKindId,
} from "@/adventure/data/v2/coopBosses";

// POST /api/v2/coop/summon — 소환서를 소모해 협동 보스 소환.
//
// 본문: { kind: CoopBossKindId }
// 같은 종류 동시 다수 소환 허용(#714) — 소환서 비용이 1차 게이트, MAX_ACTIVE_PER_KIND 는
// 목록/쿼리 비대화를 막는 느슨한 안전캡(엄밀 직렬화 없음 — 동시 소환 race 로 캡을 1~2
// 초과할 수 있으나 무해). 단일 트랜잭션: character.v2 잠금(공통 첫 락) → 소환서 검증·차감
// → 만료 sweep + 캡 확인 → 세션 INSERT(소환자 표시명 스냅샷).

type CharSave = { materials?: unknown; [k: string]: unknown };

export async function POST(req: Request) {
  const maybeUserId = await ensureUser();
  if (!maybeUserId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const userId: string = maybeUserId;

  let body: { kind?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const kindId = parseCoopBossKindId(body.kind);
  if (!kindId) {
    return Response.json({ ok: false, error: "bad_kind" }, { status: 400 });
  }
  if (!isScrollSummonableCoopBossKind(kindId)) {
    return Response.json(
      { ok: false, error: "not_scroll_summonable" },
      { status: 400 },
    );
  }
  const kind = COOP_BOSSES[kindId];
  let summonerName = "모험가";
  let result: { status: number; body: Record<string, unknown> };
  try {
    result = await db.transaction(async (tx) => {
      const now = new Date();
      // === 1. character.v2 잠금 + 소환서 검증 ===
      const charSave = await lockSaveForUpdate<CharSave>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const mats: Record<string, number> =
        typeof charSave.materials === "object" && charSave.materials !== null
          ? { ...(charSave.materials as Record<string, number>) }
          : {};
      const have = Math.max(
        0,
        Math.floor(Number(mats[SUMMON_SCROLL_MATERIAL_ID]) || 0),
      );
      if (have < kind.scrollCost) {
        return {
          status: 409,
          body: {
            ok: false,
            error: "not_enough_scrolls",
            have,
            need: kind.scrollCost,
          },
        };
      }

      // === 2. 동시 소환 캡 확인 + 세션 생성 ===
      const profile = await readSave<{ name?: string } | null>(
        tx,
        userId,
        "character-profile.v2",
        null,
      );
      summonerName = profile?.name?.trim() || "모험가";
      const created = await createCoopBossSession(tx, {
        kindId,
        userId,
        summonerName,
        now,
        visibility: COOP_INITIAL_VISIBILITY,
      });
      if (!created.ok) {
        return {
          status: 409,
          body: {
            ok: false,
            error: created.error,
            cap: created.cap,
          },
        };
      }

      // === 3. 소환서 차감 ===
      const remaining = have - kind.scrollCost;
      if (remaining > 0) mats[SUMMON_SCROLL_MATERIAL_ID] = remaining;
      else delete mats[SUMMON_SCROLL_MATERIAL_ID];
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        materials: mats,
      });
      return {
        status: 200,
        body: {
          ok: true,
          sessionId: created.sessionId,
          kind: kindId,
          scrollsLeft: remaining,
          expiresAt: created.expiresAt,
        },
      };
    });
  } catch (err) {
    console.error("[coop/summon] failed", err);
    return Response.json(
      { ok: false, error: "internal_error" },
      { status: 500 },
    );
  }

  return Response.json(result.body, { status: result.status });
}
