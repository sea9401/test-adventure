import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  REFORGE_COMBINE_COST,
  REFORGE_STONE_MATERIAL_ID,
} from "@/adventure/data/v2/v2EquipVariance";

// POST /api/v2/me/reforge-stone-combine — 일반 재련석 REFORGE_COMBINE_COST(3)개 → 상급 재련석 1개.
// 결정론·무료(골드 없음). 일반 재련석의 상위 변환 sink + 거래 수요. body 없음.
// 락: character.v2 (materials 만 변경). 강화/재련 라우트의 돌 차감 패턴 미러.

type CharSave = {
  materials?: Record<string, number>;
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

    // 일반 N개 차감(0 이면 키 제거) + 상급 1개 적립.
    const basicLeft = haveBasic - REFORGE_COMBINE_COST;
    if (basicLeft > 0) mats[basicId] = basicLeft;
    else delete mats[basicId];
    const haveHigh = Math.max(0, Math.floor(Number(mats[highId]) || 0));
    mats[highId] = haveHigh + 1;

    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      materials: mats,
    });

    return {
      status: 200,
      body: { ok: true as const, basicLeft, high: mats[highId] },
    };
  });

  return Response.json(result.body, { status: result.status });
}
