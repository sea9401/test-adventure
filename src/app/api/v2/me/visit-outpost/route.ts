import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";
import {
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
import {
  V2_CORE_LOOP_V2,
  OUTPOST_MOVE_GOLD_COST,
  spendGold,
} from "@/adventure/data/v2/coreLoopConfig";

// POST /api/v2/me/visit-outpost — 현재 머무는 거점 갱신(자유이동/재진입).
//
// 본문: { outpostId: string }
// character.v2 갱신: lastVisitedOutpost { outpostId, at } + stamina + discoveredOutpostIds.
//
// 규칙(권위 — 클라 ContinentMap 도 같은 규칙):
//  - 자유이동(지도 재설계 B안 PR-3): 유효한 거점이면 어디로든 바로 이동 — 인접/발견 게이트 없음.
//    이동 1회당 OUTPOST_MOVE_COST(스태미나) 또는 OUTPOST_MOVE_GOLD_COST(골드) 소모.
//  - 같은 거점 재진입은 무료(회복만 반영).
//  - 비용: 코어루프(V2_CORE_LOOP_V2) on = 골드(부족 시 out_of_gold 409), off = 스태미나(out_of_stamina 409).
//  - 방문 시 방문 거점 집합(discoveredOutpostIds) 갱신 — 가이드 퀘스트("거점 방문") 지표용.
//    안개(미발견 거점 시각 숨김)는 폐기 — 클라는 전 거점을 늘 표시.

type CharSave = {
  lastVisitedOutpost?: { outpostId?: string; at?: number };
  stamina?: unknown;
  gold?: number;
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
    | { kind: "out_of_stamina"; stamina: StaminaState }
    | { kind: "out_of_gold"; required: number; gold: number }
    | {
        kind: "ok";
        stamina: StaminaState;
        discovered: string[];
        gold: number;
        bankedGold: number;
      };

  const result: VisitResult = await db.transaction(
    async (tx): Promise<VisitResult> => {
      const charSave = await lockSaveForUpdate<CharSave>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const savedId = charSave.lastVisitedOutpost?.outpostId;
      const now = Date.now();
      const isMove = resolveCurrentOutpostId(savedId) !== outpostId;
      const stamina = parseStaminaFromSave(charSave.stamina, now);
      const coreLoop = V2_CORE_LOOP_V2;
      const gold =
        typeof charSave.gold === "number" && Number.isFinite(charSave.gold)
          ? Math.max(0, Math.floor(charSave.gold))
          : 0;
      const bankedGold = Math.max(0, Math.floor(Number(charSave.bankedGold) || 0));
      // 기본 = 회복만(재진입·코어루프 공통). 이동/워프는 아래에서 비용 부과.
      let nextStamina: StaminaState = applyRegen(stamina, now);
      let nextGold = gold;
      let nextBankedGold = bankedGold;

      // 이동 비용 부과 — 코어루프 on = 골드(스태미나 폐지), off = 스태미나(기존). 게이트(인접/발견)는
      // 비용 전에 통과한 상태. 부족 시 쓰기 없이 종료(out_of_*). 반환 null = 통과.
      const charge = (
        staminaCost: number,
        goldCost: number,
      ): VisitResult | null => {
        if (coreLoop) {
          const spend = spendGold(gold, bankedGold, goldCost);
          if (!spend.ok) {
            return { kind: "out_of_gold", required: goldCost, gold };
          }
          nextGold = spend.gold;
          nextBankedGold = spend.bankedGold;
          return null;
        }
        const after = tryConsume(stamina, staminaCost, now);
        if (!after) {
          return { kind: "out_of_stamina", stamina: applyRegen(stamina, now) };
        }
        nextStamina = after;
        return null;
      };

      if (isMove) {
        // 자유이동 — 유효 거점이면 어디로든(인접/발견 게이트 없음). 이동 1회 비용.
        const err = charge(OUTPOST_MOVE_COST, OUTPOST_MOVE_GOLD_COST);
        if (err) return err;
      }
      // !isMove(재진입) — nextStamina 기본(회복만), 골드 무료.

      const discovered = expandDiscovery(charSave.discoveredOutpostIds, outpostId);
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        lastVisitedOutpost: { outpostId, at: now },
        stamina: nextStamina,
        discoveredOutpostIds: discovered,
        ...(coreLoop ? { gold: nextGold, bankedGold: nextBankedGold } : {}),
      });
      return {
        kind: "ok",
        stamina: nextStamina,
        discovered,
        gold: nextGold,
        bankedGold: nextBankedGold,
      };
    },
  );

  if (result.kind === "out_of_stamina") {
    return Response.json(
      { ok: false, error: "out_of_stamina", stamina: result.stamina },
      { status: 409 },
    );
  }
  if (result.kind === "out_of_gold") {
    return Response.json(
      {
        ok: false,
        error: "out_of_gold",
        requiredGold: result.required,
        gold: result.gold,
      },
      { status: 409 },
    );
  }
  return Response.json({
    ok: true,
    outpostId,
    stamina: result.stamina,
    discoveredOutpostIds: result.discovered,
    ...(V2_CORE_LOOP_V2
      ? { gold: result.gold, bankedGold: result.bankedGold }
      : {}),
  });
}
