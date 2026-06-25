import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  COMBINE_GOLD_COST,
  REFORGE_COMBINE_COST,
  REFORGE_STONE_MATERIAL_ID,
} from "@/adventure/data/v2/v2EquipVariance";
import { V2_CORE_LOOP_V2, spendGold } from "@/adventure/data/v2/coreLoopConfig";

// POST /api/v2/me/reforge-stone-combine — 일반 재련석 REFORGE_COMBINE_COST(3)개 → 상급 재련석 1개.
// 결정론. 골드 비용 COMBINE_GOLD_COST(조합 공통). 일반 재련석의 상위 변환 sink + 거래 수요. body 없음.
// 락: character.v2 (materials + gold 변경). 강화/재련 라우트의 돌·골드 차감 패턴 미러.

type CharSave = {
  materials?: Record<string, number>;
  gold?: number;
  bankedGold?: number;
  [k: string]: unknown;
};

export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const basicId = REFORGE_STONE_MATERIAL_ID.basic;
    const highId = REFORGE_STONE_MATERIAL_ID.high;
    const mats = { ...(charSave.materials ?? {}) };
    const haveBasic = Math.max(0, Math.floor(Number(mats[basicId]) || 0));
    if (haveBasic < REFORGE_COMBINE_COST) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_stone" as const,
          need: REFORGE_COMBINE_COST,
        },
      };
    }

    // 골드 비용 — 코어루프 on 이면 은행 우선 차감(강화/재련 패턴).
    const haveGold = Math.max(0, Math.floor(Number(charSave.gold) || 0));
    const bankedGold = Math.max(0, Math.floor(Number(charSave.bankedGold) || 0));
    const spend = spendGold(haveGold, bankedGold, COMBINE_GOLD_COST);
    if (!spend.ok) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_gold" as const,
          goldCost: COMBINE_GOLD_COST,
        },
      };
    }

    // 일반 N개 차감(0 이면 키 제거) + 상급 1개 적립.
    const basicLeft = haveBasic - REFORGE_COMBINE_COST;
    if (basicLeft > 0) mats[basicId] = basicLeft;
    else delete mats[basicId];
    const haveHigh = Math.max(0, Math.floor(Number(mats[highId]) || 0));
    mats[highId] = haveHigh + 1;

    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      gold: spend.gold,
      bankedGold: spend.bankedGold,
      materials: mats,
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        basicLeft,
        high: mats[highId],
        goldCost: COMBINE_GOLD_COST,
        gold: spend.gold,
        ...(V2_CORE_LOOP_V2 ? { bankedGold: spend.bankedGold } : {}),
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
