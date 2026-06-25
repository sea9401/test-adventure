import { eq } from "drizzle-orm";
import { db } from "@/db";
import { outpostOccupations } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { guildOwningOutpost } from "@/lib/server/v2Settlement";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  FORT_MAX_HP,
  currentFortHp,
  repairFromKits,
} from "@/adventure/data/v2/outpostSiege";
import { WALL_REPAIR_KIT_ID } from "@/adventure/data/v2/settlementMaterials";
import { V2_SETTLEMENT_WARFARE } from "@/adventure/data/v2/settlementWarfareConfig";

// 정착지 전쟁 — 성벽 수동 수리. 옛 골드 수리(너무 저렴)를 폐지하고 "성벽 수리 키트"
//   (통나무3+철광석3 조합·/api/v2/me/repair-kit-combine) 소비로 대체한다. 드랍 재료가 곧
//   방어 비용 — 능동 방어.
//   POST { outpostId } — 점령 길드원이 본인 인벤의 키트로 성벽을 결손분만큼(보유 키트 한도) 수리.
//     키트 1개 = 성벽 HP FORT_HP_PER_REPAIR_KIT(100). 부족하면 가진 만큼만.
//   게이트: V2_SETTLEMENT_WARFARE on + 점령 길드 멤버(guildOwningOutpost).
//   응답: { ok, fortHp, fortMaxHp, repairedHp, kitsSpent, kitsLeft }
//     - 미점령/타 길드 → 403  · 이미 풀성벽/키트부족 → repairedHp 0 (ok)

type CharSave = { materials?: Record<string, number>; [k: string]: unknown };

export async function POST(req: Request) {
  if (!V2_SETTLEMENT_WARFARE) {
    return Response.json({ ok: false, error: "disabled" }, { status: 404 });
  }
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
  const outpostId = typeof body.outpostId === "string" ? body.outpostId : "";
  if (!outpostId) {
    return Response.json(
      { ok: false, error: "missing_outpost" },
      { status: 400 },
    );
  }

  // lock 순서: 점령행(guildOwningOutpost 가 FOR UPDATE) → 수리하는 멤버 character.v2.
  //   attack 라우트(점령행 → 공격자 char.v2)와 같은 순서라 데드락 안전.
  const result = await db.transaction(async (tx) => {
    const guildId = await guildOwningOutpost(tx, userId, outpostId);
    if (guildId == null) {
      return { status: 403, body: { ok: false as const, error: "not_owner" } };
    }
    // 점령행은 위에서 FOR UPDATE 로 잠금 — 성벽 현재값(재생 반영) 계산용 필드만 추가 read.
    const occ = (
      await tx
        .select({
          fortHp: outpostOccupations.fortHp,
          fortMaxHp: outpostOccupations.fortMaxHp,
          fortUpdatedAt: outpostOccupations.fortUpdatedAt,
        })
        .from(outpostOccupations)
        .where(eq(outpostOccupations.outpostId, outpostId))
        .limit(1)
    )[0];
    if (!occ) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_occupied" },
      };
    }
    const fortMaxHp = occ.fortMaxHp ?? FORT_MAX_HP;
    const fortHpNow = currentFortHp(
      occ.fortHp,
      fortMaxHp,
      occ.fortUpdatedAt,
      new Date(),
    );
    const deficit = fortMaxHp - fortHpNow;

    // 키트 보유 — character.v2 lock 후 read(수리 통과 시 차감).
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const mats = { ...(charSave.materials ?? {}) };
    const haveKits = Math.max(0, Math.floor(Number(mats[WALL_REPAIR_KIT_ID]) || 0));

    const { hp, kitsUsed } = repairFromKits(deficit, haveKits);
    if (kitsUsed <= 0) {
      // 이미 풀성벽이거나 키트 0 — 변경 없음.
      return {
        status: 200,
        body: {
          ok: true as const,
          fortHp: fortHpNow,
          fortMaxHp,
          repairedHp: 0,
          kitsSpent: 0,
          kitsLeft: haveKits,
        },
      };
    }
    const kitsLeft = haveKits - kitsUsed;
    if (kitsLeft > 0) mats[WALL_REPAIR_KIT_ID] = kitsLeft;
    else delete mats[WALL_REPAIR_KIT_ID];
    const newFortHp = fortHpNow + hp;
    await tx
      .update(outpostOccupations)
      // fortUpdatedAt 갱신으로 재생 기준점 리셋(수리값에서 다시 재생 시작).
      .set({ fortHp: newFortHp, fortUpdatedAt: new Date() })
      .where(eq(outpostOccupations.outpostId, outpostId));
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      materials: mats,
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        fortHp: newFortHp,
        fortMaxHp,
        repairedHp: hp,
        kitsSpent: kitsUsed,
        kitsLeft,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
