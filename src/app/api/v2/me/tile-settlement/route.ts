import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tileSettlements } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import {
  V2_CORE_LOOP_V2,
  V2_FREEFORM_TILES,
  spendGold,
} from "@/adventure/data/v2/coreLoopConfig";
import {
  TILE_BOARD_SIZE,
  TILE_OUTPOST_AT,
  tileKey,
  TILE_FOUND_COST,
  TILE_PROMOTE_COST,
  tileNextTier,
  isTileSettlementTier,
  scaledTileGoldCost,
  isTileSettleable,
} from "@/adventure/data/v2/tileConfig";
import { isValidVillageName } from "@/adventure/data/v2/settlement";
import {
  V2_TILE_WARFARE,
  V2_TILE_PRODUCTION,
} from "@/adventure/data/v2/settlementWarfareConfig";
import { isAtGridDungeonEntrance } from "@/adventure/data/v2/gridDungeon";
import {
  createTileOccupation,
  removeTileWarfare,
} from "@/lib/server/tileOccupation";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { isGuildMasterOrVice } from "@/lib/server/guildAdmin";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";

// POST /api/v2/me/tile-settlement — 빈 땅 개척 정착지 건설/승격/철거. (자유 타일 지도 Phase 3)
//
// 본문: { action: "found" | "promote" | "demolish", col, row, name? }
//  - found: 빈 칸(거점 아님·미정착)에 개척마을(frontier) 건설. TILE_FOUND_COST 골드. name 필수
//      — 창립자가 직접 지은 이름이 지도·헤더의 거점 표시 이름(tile_settlements.name)이 된다.
//      이 이름은 이후 불변(개명 없음) — 마을 건설도 이 이름을 그대로 재사용한다.
//  - promote: 본인 정착지 한 단계 승격(frontier→village→city→metropolis). TILE_PROMOTE_COST.
//  - demolish: 본인 정착지 철거(환불 없음).
//  - V2_FREEFORM_TILES off 면 404(플래그 게이트) — 라이브(flag off)는 이 테이블 무접촉.

type CharSave = { gold?: number; bankedGold?: number; [k: string]: unknown };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 골드 과금 — 코어루프 on 일 때만(은행 우선). 부족 시 ok:false. off 면 과금 없이 통과.
async function chargeGold(
  tx: Tx,
  userId: string,
  cost: number,
): Promise<{ ok: boolean; gold: number; bankedGold: number }> {
  const save = await lockSaveForUpdate<CharSave>(tx, userId, "character.v2", {});
  const gold =
    typeof save.gold === "number" && Number.isFinite(save.gold)
      ? Math.max(0, Math.floor(save.gold))
      : 0;
  const banked = Math.max(0, Math.floor(Number(save.bankedGold) || 0));
  if (!V2_CORE_LOOP_V2 || cost <= 0) {
    return { ok: true, gold, bankedGold: banked };
  }
  const spend = spendGold(gold, banked, cost);
  if (!spend.ok) return { ok: false, gold, bankedGold: banked };
  await upsertSave(tx, userId, "character.v2", {
    ...save,
    gold: spend.gold,
    bankedGold: spend.bankedGold,
  });
  return { ok: true, gold: spend.gold, bankedGold: spend.bankedGold };
}

export async function POST(req: Request) {
  if (!V2_FREEFORM_TILES) {
    return Response.json({ ok: false, error: "not_enabled" }, { status: 404 });
  }
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { action?: unknown; col?: unknown; row?: unknown; name?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const action = body.action;
  const col = Number(body.col);
  const row = Number(body.row);
  const validTile =
    Number.isInteger(col) &&
    Number.isInteger(row) &&
    col >= 0 &&
    row >= 0 &&
    col < TILE_BOARD_SIZE &&
    row < TILE_BOARD_SIZE;
  if (
    !validTile ||
    (action !== "found" && action !== "promote" && action !== "demolish")
  ) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  // 이름은 건설(found)에만 필요 — 창립자가 직접 짓는 표시 이름(이후 불변·개명 없음). 마을 이름 규칙 재사용.
  const rawName = typeof body.name === "string" ? body.name : "";
  const needsName = action === "found";
  if (needsName && !isValidVillageName(rawName)) {
    return Response.json({ ok: false, error: "invalid_name" }, { status: 400 });
  }
  const name = rawName.trim();

  type Res =
    | { kind: "ok"; gold: number; bankedGold: number }
    | {
        kind: "err";
        status: number;
        error: string;
        gold?: number;
        required?: number;
      };

  const result: Res = await db.transaction(async (tx): Promise<Res> => {
    // FOR UPDATE — 정착지 행을 트랜잭션 내내 잠근다. 잠그지 않으면 동시 promote/demolish
    // 두 요청(더블클릭·병렬)이 같은 stale tier 를 읽어, 세이브 락만으로는 막히지 않는
    // read-modify-write race 가 난다(promote: 같은 tier 비용을 둘 다 차감하고 한 단계만
    // 승격 = 비용 중복 차감). 행 락이 두 번째 요청을 직렬화해 갱신된 tier 를 다시 읽게 한다.
    // found(빈 칸)는 행이 없어 FOR UPDATE 가 잠글 대상이 없지만 복합 PK 가 중복 insert 를 막는다.
    const existing = (
      await tx
        .select()
        .from(tileSettlements)
        .where(and(eq(tileSettlements.col, col), eq(tileSettlements.row, row)))
        .for("update")
        .limit(1)
    )[0];

    if (action === "found") {
      if (TILE_OUTPOST_AT.has(tileKey(col, row))) {
        return { kind: "err", status: 400, error: "tile_is_outpost" };
      }
      if (isAtGridDungeonEntrance({ col, row })) {
        return { kind: "err", status: 400, error: "tile_is_dungeon_entrance" };
      }
      // 산맥·호수 등 정착 불가 지형(settleable=false)엔 개척마을을 세울 수 없다. move-tile 이
      //   이미 막아 tilePos 가 닿을 수 없지만(아래 not_at_tile), 방어적 게이트(§2.1/2.6).
      if (!isTileSettleable(col, row)) {
        return { kind: "err", status: 400, error: "not_settleable" };
      }
      if (existing) {
        return { kind: "err", status: 409, error: "already_settled" };
      }
      // 개척은 그 칸에 실제로 가 있어야 가능 — 플레이어 마커(tilePos)가 대상 칸이어야 한다.
      //   빈 칸은 move-tile 로만 도달(tilePos 갱신)하므로 좌표 일치=현장에 있음. 읽기 게이트라
      //   비잠금 readSave(권위적 위치 갱신은 move-tile 의 락이 담당).
      const pos = await readSave<{
        tilePos?: { col?: number; row?: number };
      }>(tx, userId, "character.v2", {});
      if (pos.tilePos?.col !== col || pos.tilePos?.row !== row) {
        return { kind: "err", status: 409, error: "not_at_tile" };
      }
      // 개척마을 생성비 = 기본비용 × 리베라(중앙) 거리 배수 — 중앙에서 멀수록↑(중앙=기본).
      const foundCost = scaledTileGoldCost(TILE_FOUND_COST, col, row);
      // 영토=길드 소유 — 개척마을 생성은 길드 행위(마스터/부마스터만·길드 자금 소모).
      //   무소속은 개척 불가(길드 생성/가입 필요). V2_TILE_WARFARE off(레거시·전쟁 비활성)면
      //   길드 타일 개념이 없어 솔로 경로(점령행 없음·플래그 off 환경 호환).
      const guildId = V2_TILE_WARFARE ? await getGuildId(tx, userId) : null;
      if (V2_TILE_WARFARE && guildId == null) {
        return { kind: "err", status: 403, error: "need_guild" };
      }
      if (guildId != null) {
        if (!(await isGuildMasterOrVice(tx, guildId, userId))) {
          return { kind: "err", status: 403, error: "not_guild_admin" };
        }
        const gr = await lockGuildResources(tx, guildId);
        if (V2_CORE_LOOP_V2 && gr.gold < foundCost) {
          return {
            kind: "err",
            status: 409,
            error: "out_of_guild_gold",
            required: foundCost,
            gold: gr.gold,
          };
        }
        await tx.insert(tileSettlements).values({
          col,
          row,
          userId,
          tier: "frontier",
          name,
        });
        await createTileOccupation(tx, { userId, col, row, tier: "frontier" });
        if (V2_CORE_LOOP_V2) {
          await upsertGuildResources(tx, guildId, {
            gold: gr.gold - foundCost,
          });
        }
        // 응답 골드 = 개인 골드(길드 자금 차감이라 개인은 불변) — 클라 표시용.
        const cur = await chargeGold(tx, userId, 0);
        return { kind: "ok", gold: cur.gold, bankedGold: cur.bankedGold };
      }
      // V2_TILE_WARFARE off(레거시·전쟁 비활성) — 본인 골드로 개척(점령행 없음).
      //   warfare on 의 무소속은 위에서 need_guild 로 이미 차단됨.
      const charge = await chargeGold(tx, userId, foundCost);
      if (!charge.ok) {
        return {
          kind: "err",
          status: 409,
          error: "out_of_gold",
          required: foundCost,
          gold: charge.gold,
        };
      }
      await tx.insert(tileSettlements).values({
        col,
        row,
        userId,
        tier: "frontier",
        name,
      });
      return { kind: "ok", gold: charge.gold, bankedGold: charge.bankedGold };
    }

    // promote / demolish — 본인 정착지여야.
    if (!existing) return { kind: "err", status: 404, error: "not_found" };
    if (existing.userId !== userId) {
      return { kind: "err", status: 403, error: "not_owner" };
    }

    if (action === "demolish") {
      await tx
        .delete(tileSettlements)
        .where(and(eq(tileSettlements.col, col), eq(tileSettlements.row, row)));
      // 전쟁 행 정리 — 점령/금고/수비큐/영주(무행이면 no-op·플래그 무관 항상 안전).
      await removeTileWarfare(tx, col, row);
      const cur = await chargeGold(tx, userId, 0); // 읽기용(과금 0).
      return { kind: "ok", gold: cur.gold, bankedGold: cur.bankedGold };
    }

    // promote — 생산 관리 이전(T3): V2_TILE_PRODUCTION on 이면 지도 승격 폐지.
    //   승격은 관리 화면(/outpost/tile:c,r)의 생산 시스템(마을 건설→슬롯/생산/자원)으로 일원화.
    if (V2_TILE_PRODUCTION) {
      return {
        kind: "err",
        status: 409,
        error: "use_production_management",
      };
    }
    const tier = isTileSettlementTier(existing.tier) ? existing.tier : "frontier";
    const next = tileNextTier(tier);
    if (!next) return { kind: "err", status: 409, error: "max_tier" };
    const cost = TILE_PROMOTE_COST[tier];
    const charge = await chargeGold(tx, userId, cost);
    if (!charge.ok) {
      return {
        kind: "err",
        status: 409,
        error: "out_of_gold",
        required: cost,
        gold: charge.gold,
      };
    }
    await tx
      .update(tileSettlements)
      .set({ tier: next })
      .where(and(eq(tileSettlements.col, col), eq(tileSettlements.row, row)));
    return { kind: "ok", gold: charge.gold, bankedGold: charge.bankedGold };
  });

  if (result.kind === "err") {
    return Response.json(
      {
        ok: false,
        error: result.error,
        ...(result.required != null ? { requiredGold: result.required } : {}),
        ...(result.gold != null ? { gold: result.gold } : {}),
      },
      { status: result.status },
    );
  }
  return Response.json({
    ok: true,
    ...(V2_CORE_LOOP_V2
      ? { gold: result.gold, bankedGold: result.bankedGold }
      : {}),
  });
}
