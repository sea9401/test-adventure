import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  OUTPOST_MOVE_COST,
  applyRegen,
  parseStaminaFromSave,
  tryConsume,
  type StaminaState,
} from "@/adventure/v2/stamina";
import {
  V2_CORE_LOOP_V2,
  V2_FREEFORM_TILES,
  OUTPOST_MOVE_GOLD_COST,
  spendGold,
} from "@/adventure/data/v2/coreLoopConfig";
import {
  TILE_BOARD_SIZE,
  TILE_OUTPOST_AT,
  tileKey,
  isTileSettleable,
} from "@/adventure/data/v2/tileConfig";
import { isAtGridDungeonEntrance } from "@/adventure/data/v2/gridDungeon";

// POST /api/v2/me/move-tile — 거점 없는 빈 칸으로 자유 이동. (자유 타일 지도 Phase 2)
//
// 본문: { col, row }. character.v2.tilePos { col, row, at } 갱신.
//  - 거점이 있는 칸 이동은 기존 /me/visit-outpost 사용 — 여긴 "빈 땅" 전용 마커 이동.
//  - 이동 1회 비용 = visit 와 동일(코어루프 on=골드 OUTPOST_MOVE_GOLD_COST, off=스태미나).
//    같은 칸 재요청은 무료(회복만). 사냥 base(lastVisitedOutpost)는 건드리지 않는다.
//  - V2_FREEFORM_TILES off 면 404(플래그 게이트) — 라이브(플래그 off)에선 호출되지 않음.

type CharSave = {
  stamina?: unknown;
  gold?: number;
  bankedGold?: number;
  tilePos?: { col?: number; row?: number; at?: number };
  [k: string]: unknown;
};

export async function POST(req: Request) {
  if (!V2_FREEFORM_TILES) {
    return Response.json({ ok: false, error: "not_enabled" }, { status: 404 });
  }
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { col?: unknown; row?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const col = Number(body.col);
  const row = Number(body.row);
  const valid =
    Number.isInteger(col) &&
    Number.isInteger(row) &&
    col >= 0 &&
    row >= 0 &&
    col < TILE_BOARD_SIZE &&
    row < TILE_BOARD_SIZE;
  if (!valid) {
    return Response.json({ ok: false, error: "bad_tile" }, { status: 400 });
  }
  // 거점이 있는 칸은 이 라우트가 아니라 /me/visit-outpost 로 가야 한다(주석 계약). 가드가
  // 없으면 거점 칸으로 직접 move-tile 호출 시 마커만 거점 칸에 얹혀 사냥 base 와 어긋난다.
  if (TILE_OUTPOST_AT.has(tileKey(col, row))) {
    return Response.json(
      { ok: false, error: "tile_is_outpost" },
      { status: 400 },
    );
  }
  // 산맥·호수 등 통행 불가 지형(settleable=false)은 빈 칸이라도 이동할 수 없다 — 정복 인접
  //   사슬의 디딤돌이 될 수 없는 "벽"(docs/v2-map-terrain-plan.md §2.1/2.6).
  //   던전 입구는 정착 불가여도 진입형 콘텐츠 목적지라 통행 가능 예외로 둔다.
  if (!isTileSettleable(col, row) && !isAtGridDungeonEntrance({ col, row })) {
    return Response.json(
      { ok: false, error: "impassable_terrain" },
      { status: 400 },
    );
  }

  type Res =
    | { kind: "out_of_stamina"; stamina: StaminaState }
    | { kind: "out_of_gold"; required: number; gold: number }
    | { kind: "ok"; stamina: StaminaState; gold: number; bankedGold: number };

  const result: Res = await db.transaction(async (tx): Promise<Res> => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const now = Date.now();
    const same = charSave.tilePos?.col === col && charSave.tilePos?.row === row;
    const stamina = parseStaminaFromSave(charSave.stamina, now);
    const gold =
      typeof charSave.gold === "number" && Number.isFinite(charSave.gold)
        ? Math.max(0, Math.floor(charSave.gold))
        : 0;
    const bankedGold = Math.max(0, Math.floor(Number(charSave.bankedGold) || 0));
    let nextStamina: StaminaState = applyRegen(stamina, now);
    let nextGold = gold;
    let nextBankedGold = bankedGold;

    if (!same) {
      if (V2_CORE_LOOP_V2) {
        const spend = spendGold(gold, bankedGold, OUTPOST_MOVE_GOLD_COST);
        if (!spend.ok) {
          return { kind: "out_of_gold", required: OUTPOST_MOVE_GOLD_COST, gold };
        }
        nextGold = spend.gold;
        nextBankedGold = spend.bankedGold;
      } else {
        const after = tryConsume(stamina, OUTPOST_MOVE_COST, now);
        if (!after) {
          return { kind: "out_of_stamina", stamina: applyRegen(stamina, now) };
        }
        nextStamina = after;
      }
    }

    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      tilePos: { col, row, at: now },
      stamina: nextStamina,
      ...(V2_CORE_LOOP_V2 ? { gold: nextGold, bankedGold: nextBankedGold } : {}),
    });
    return {
      kind: "ok",
      stamina: nextStamina,
      gold: nextGold,
      bankedGold: nextBankedGold,
    };
  });

  if (result.kind === "out_of_stamina") {
    return Response.json(
      { ok: false, error: "out_of_stamina", stamina: result.stamina },
      { status: 409 },
    );
  }
  if (result.kind === "out_of_gold") {
    return Response.json(
      { ok: false, error: "out_of_gold", requiredGold: result.required, gold: result.gold },
      { status: 409 },
    );
  }
  return Response.json({
    ok: true,
    tilePos: { col, row },
    stamina: result.stamina,
    ...(V2_CORE_LOOP_V2
      ? { gold: result.gold, bankedGold: result.bankedGold }
      : {}),
  });
}
