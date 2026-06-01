import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";
import {
  canMoveToOutpost,
  expandDiscovery,
  resolveCurrentOutpostId,
} from "@/adventure/data/v2/outpostGraph";
import {
  OUTPOST_MOVE_COST,
  applyRegen,
  parseStaminaFromSave,
  tryConsume,
  type StaminaState,
} from "@/adventure/v2/stamina";

// POST /api/v2/me/visit-outpost — 현재 머무는 거점 갱신(이동/재진입).
//
// 본문: { outpostId: string }
// character.v2 갱신: lastVisitedOutpost { outpostId, at } + stamina + discoveredOutpostIds.
//
// 규칙(권위 — 클라 ContinentMap 도 같은 규칙으로 게이트):
//  - 이동은 인접 거점으로만(canMoveToOutpost). 비인접은 not_adjacent 400.
//  - 이동 1홉당 스태미나 OUTPOST_MOVE_COST 소모. 같은 거점 재진입은 무료(회복만 반영).
//    부족하면 out_of_stamina 409.
//  - 방문 시 발견(안개) 확장 — 그 거점 + 인접을 discoveredOutpostIds 에 추가.

type CharSave = {
  lastVisitedOutpost?: { outpostId?: string; at?: number };
  stamina?: unknown;
  discoveredOutpostIds?: string[];
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { outpostId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (
    typeof body.outpostId !== "string" ||
    !OUTPOSTS.some((o) => o.id === body.outpostId)
  ) {
    return Response.json({ ok: false, error: "bad_outpost" }, { status: 400 });
  }
  const outpostId = body.outpostId;

  type VisitResult =
    | { kind: "not_adjacent" }
    | { kind: "out_of_stamina"; stamina: StaminaState }
    | { kind: "ok"; stamina: StaminaState; discovered: string[] };

  const result: VisitResult = await db.transaction(
    async (tx): Promise<VisitResult> => {
      const charSave = await lockSaveForUpdate<CharSave>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const savedId = charSave.lastVisitedOutpost?.outpostId;
      if (!canMoveToOutpost(savedId, outpostId)) {
        return { kind: "not_adjacent" }; // 쓰기 없이 종료 — 위치 변경 안 함.
      }

      const now = Date.now();
      const isMove = resolveCurrentOutpostId(savedId) !== outpostId;
      const stamina = parseStaminaFromSave(charSave.stamina, now);
      let nextStamina: StaminaState;
      if (isMove) {
        const after = tryConsume(stamina, OUTPOST_MOVE_COST, now);
        if (!after) {
          // 쓰기 없이 종료 — 스태미나 부족.
          return { kind: "out_of_stamina", stamina: applyRegen(stamina, now) };
        }
        nextStamina = after;
      } else {
        nextStamina = applyRegen(stamina, now); // 재진입 — 회복만 반영, 무료.
      }

      const discovered = expandDiscovery(charSave.discoveredOutpostIds, outpostId);
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        lastVisitedOutpost: { outpostId, at: now },
        stamina: nextStamina,
        discoveredOutpostIds: discovered,
      });
      return { kind: "ok", stamina: nextStamina, discovered };
    },
  );

  if (result.kind === "not_adjacent") {
    return Response.json({ ok: false, error: "not_adjacent" }, { status: 400 });
  }
  if (result.kind === "out_of_stamina") {
    return Response.json(
      { ok: false, error: "out_of_stamina", stamina: result.stamina },
      { status: 409 },
    );
  }
  return Response.json({
    ok: true,
    outpostId,
    stamina: result.stamina,
    discoveredOutpostIds: result.discovered,
  });
}
