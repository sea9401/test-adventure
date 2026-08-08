import { db } from "@/db";
import { spendGold } from "@/adventure/data/v2/coreLoopConfig";
import {
  cultivationResetGoldCost,
  emptyProficiency,
  parseProficiencyForChar,
  resetCultivation,
  totalCapGains,
  usablePoints,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";

type CharSave = {
  class?: unknown;
  level?: unknown;
  gold?: number;
  bankedGold?: number;
  [key: string]: unknown;
};

// POST /api/v2/me/cultivate/reset — 수행으로 얻은 한계치를 전부 초기화하고,
// 해당 한계치에 사용한 숙달 포인트를 전액 돌려준다. 적용 중인 레벨 성장값은 재분배
// 대기 포인트로 회수해 이후 수행 프로필로 다시 배분한다. 첫 1회 무료, 이후 매회 1,500만 골드.
// 수행 횟수·직업 숙련도는 업적/진행 기록이므로 유지한다.
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
    const prof = parseProficiencyForChar(
      await lockSaveForUpdate<V2ProficiencyState>(
        tx,
        userId,
        "proficiency.v2",
        emptyProficiency(),
      ),
      charSave,
    );
    const reset = resetCultivation(prof);
    if (!reset) {
      return {
        status: 400,
        body: { ok: false as const, error: "nothing_to_reset" as const },
      };
    }

    const resetCount = prof.cultivationResetCount ?? 0;
    const goldCost = cultivationResetGoldCost(resetCount);
    const gold = Math.max(0, Math.floor(Number(charSave.gold) || 0));
    const bankedGold = Math.max(
      0,
      Math.floor(Number(charSave.bankedGold) || 0),
    );
    const goldSpend = spendGold(gold, bankedGold, goldCost);
    if (!goldSpend.ok) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_gold" as const,
          requiredGold: goldCost,
          haveGold: gold + bankedGold,
        },
      };
    }

    const nextChar: CharSave = {
      ...charSave,
      gold: goldSpend.gold,
      bankedGold: goldSpend.bankedGold,
    };
    await upsertSave(tx, userId, "character.v2", nextChar);
    await upsertSave(tx, userId, "proficiency.v2", reset.next);

    return {
      status: 200,
      body: {
        ok: true as const,
        spentGold: goldCost,
        refundedPoints: reset.refundedPoints,
        points: usablePoints(reset.next),
        capGains: totalCapGains(reset.next),
        caps: {},
        growthRespecPoints: reset.next.growthRespecPoints ?? 0,
        resetCount: reset.next.cultivationResetCount ?? resetCount + 1,
        nextResetGoldCost: cultivationResetGoldCost(
          reset.next.cultivationResetCount ?? resetCount + 1,
        ),
        gold: goldSpend.gold,
        bankedGold: goldSpend.bankedGold,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
