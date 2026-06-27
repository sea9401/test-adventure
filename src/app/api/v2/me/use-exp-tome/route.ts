import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { parseRareMaps } from "@/adventure/data/v2/rareMaps";
import { applyExpTomeGrant, EXP_TOME_GRANT } from "@/lib/server/expTomeGrant";

// POST /api/v2/me/use-exp-tome — 「경험치의 비약」(레어맵 utility, 테스트 전용) 1회 소모.
//   body: { map: <iid> }
// EXP 100만을 한 판 사냥처럼 적용(레벨 + 직군 누적레벨 + 스탯 성장). 관리자 지급으로
// 보유 → 인벤토리 소모품 탭에서 사용. 락 순서는 전 라우트 공통 character.v2 우선.

type CharSave = {
  class?: unknown;
  level?: number;
  exp?: number;
  rareMaps?: unknown;
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { map?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const iid = typeof body.map === "string" ? body.map : "";
  if (!iid) {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const now = Date.now();
      // character.v2 먼저 락(전 라우트 공통 순서 — 데드락 회피).
      const charSave = await lockSaveForUpdate<CharSave>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const maps = parseRareMaps(charSave.rareMaps, now);
      const map = maps.find((m) => m.iid === iid && m.kind === "exp_tome");
      if (!map) {
        return { status: 403, body: { ok: false as const, error: "no_map" } };
      }

      const proficiencyRaw = await lockSaveForUpdate(
        tx,
        userId,
        "proficiency.v2",
        {},
      );
      const grant = applyExpTomeGrant(charSave, proficiencyRaw, EXP_TOME_GRANT);

      // 지도 1회 소모 — runsLeft 차감(0 이면 다음 read 의 parseRareMaps 가 purge).
      const nextMaps = maps.map((m) =>
        m.iid === iid ? { ...m, runsLeft: m.runsLeft - 1 } : m,
      );
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        level: grant.level,
        exp: grant.exp,
        totalLevels: grant.totalLevels,
        rareMaps: nextMaps,
      });
      await upsertSave(tx, userId, "proficiency.v2", grant.proficiency);

      return {
        status: 200,
        body: {
          ok: true as const,
          level: grant.level,
          levelsGained: grant.levelsGained,
          grantedExp: EXP_TOME_GRANT,
          runsLeft: map.runsLeft - 1,
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json(
      { ok: false, error: "server_error" },
      { status: 500 },
    );
  }
}
