import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  HUNT_COST,
  applyRegen,
  parseStaminaFromSave,
  tryConsume,
} from "@/adventure/v2/stamina";

// POST /api/v2/dungeon/hunt — 던전 한 번 사냥 intent.
//
// 본문: { floor: 1 | 2 | 3 | 4 | 5 }
// 서버 권위:
//   1. saves_kv 의 character.v2 행을 잠그고(FOR UPDATE) 캐릭 상태 fetch.
//   2. stamina 회복 적용 후 HUNT_COST 만큼 차감 시도.
//   3. 부족 시 409 out_of_stamina (회복 후 표시값 반환해서 클라가 즉시 UI 갱신 가능).
//   4. 차감 성공: 캐릭 save 갱신.
//   5. 응답: { ok, stamina, result } — result 는 이번 PR 에선 placeholder.
//      다음 PR 에서 라이브 전투 엔진 1마리 단판 sim 통합.

const VALID_FLOORS = [1, 2, 3, 4, 5] as const;

type HuntResultPlaceholder = {
  floor: number;
  // 후속 PR 에서 채울 필드들 (전투 결과)
  // enemyName: string;
  // expGained: number;
  // goldGained: number;
  // drops: ...;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { floor?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (
    typeof body.floor !== "number" ||
    !(VALID_FLOORS as readonly number[]).includes(body.floor)
  ) {
    return Response.json({ error: "bad_intent" }, { status: 400 });
  }
  const floor = body.floor;

  const result = await db.transaction(async (tx) => {
    const char = await lockSaveForUpdate<{
      stamina?: unknown;
      [k: string]: unknown;
    }>(tx, userId, "character.v2", {});
    const now = Date.now();
    const stamina = parseStaminaFromSave(char.stamina, now);
    const after = tryConsume(stamina, HUNT_COST, now);
    if (!after) {
      // 부족 — 회복 후 표시값을 응답해서 UI 즉시 갱신.
      return {
        ok: false as const,
        error: "out_of_stamina" as const,
        stamina: applyRegen(stamina, now),
      };
    }
    const next = { ...char, stamina: after };
    await upsertSave(tx, userId, "character.v2", next);
    const huntResult: HuntResultPlaceholder = { floor };
    return { ok: true as const, stamina: after, result: huntResult };
  });

  if (!result.ok) return Response.json(result, { status: 409 });
  return Response.json(result);
}
