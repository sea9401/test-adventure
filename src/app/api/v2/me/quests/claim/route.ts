import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import {
  buildQuestCtx,
  assembleQuestExtras,
  parseClaimed,
  GUIDE_QUESTS_KEY,
} from "@/lib/server/v2QuestContext";
import { questById, isQuestClaimable } from "@/adventure/data/v2/v2Quests";
import {
  parseEquipmentSave,
  genEquipIid,
  type EquipmentSave,
} from "@/adventure/data/v2/v2Equipment";
import {
  STAMINA_POTIONS_KEY,
  staminaPotionCount,
} from "@/adventure/v2/staminaPotions";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import { backfillClaimedQuestTitleRewardsInTx } from "@/lib/server/questTitleBackfill";

// POST /api/v2/me/quests/claim  { questId } — 가이드 퀘스트 보상 수령.
//   서버가 세이브에서 완료를 재판정(클라 신뢰 안 함) + 미수령 확인 → 보상 지급 + claimed 기록.
//   락 순서 character.v2 → equipment.v2 → guide-quests.v2 → adventure-log.v2(칭호 보상 시만)
//   → stamina-potions.v1(leaf, 포션 보상 시만). stamina-potions 는 항상 마지막 잠금 = 데드락 회피.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { questId?: unknown };
  try {
    body = (await req.json()) as { questId?: unknown };
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const questId = typeof body.questId === "string" ? body.questId : null;

  // 반복(일일/주간) 퀘는 개별 보상 폐지(2026-06-20) — 보상은 마일스톤 번들(claim-bundle 라우트).
  //   이 라우트는 가이드 퀘스트 전용. 반복 questId 가 와도 아래 unknown_quest 로 떨어진다.
  const def = questId ? questById(questId) : undefined;
  if (!def) {
    return Response.json(
      { ok: false, error: "unknown_quest" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    // 보상 지급 대상(character.gold / equipment.owned) 은 락, 판정 입력(proficiency·log)은 무락 read.
    const charSave = await lockSaveForUpdate<{
      class?: unknown;
      level?: unknown;
      frontierDepth?: unknown;
      specChoice?: unknown;
      gold?: number;
      bankedGold?: number;
    }>(tx, userId, "character.v2", {});
    const equipSave = await lockSaveForUpdate<EquipmentSave>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const guideSave = await lockSaveForUpdate<{ claimed?: unknown }>(
      tx,
      userId,
      GUIDE_QUESTS_KEY,
      {},
    );
    const proficiencyRaw = await readSave(tx, userId, "proficiency.v2", {});
    const advLogRaw = await readSave(tx, userId, "adventure-log.v2", {});
    const skillsRaw = await readSave(tx, userId, "skills.v2", {});
    const craftingRaw = await readSave(tx, userId, "crafting.v2", {});
    const extras = await assembleQuestExtras(tx, userId);

    const ctx = buildQuestCtx({
      charRaw: charSave,
      proficiencyRaw,
      advLogRaw,
      equipmentRaw: equipSave,
      skillsRaw,
      craftingRaw,
      extras,
    });
    const claimed = parseClaimed(guideSave);

    if (claimed.has(def.id)) {
      const retroactiveTitleIds = def.reward.titleId
        ? await backfillClaimedQuestTitleRewardsInTx(
            tx,
            userId,
            new Set([def.id]),
            advLogRaw,
          )
        : [];
      if (retroactiveTitleIds.length > 0) {
        return {
          status: 200,
          body: {
            ok: true as const,
            questId: def.id,
            retroactive: true as const,
            reward: {
              gold: 0,
              equip: null,
              staminaPotions: 0,
              titleId: retroactiveTitleIds[0],
            },
            gold: Math.max(0, charSave.gold ?? 0),
            bankedGold: Math.max(0, charSave.bankedGold ?? 0),
          },
        };
      }
      return {
        status: 409,
        body: { ok: false as const, error: "already_claimed" as const },
      };
    }
    if (!isQuestClaimable(def, ctx, claimed)) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_complete" as const },
      };
    }

    // 보상 지급 — 골드는 은행(character.v2.bankedGold)으로 입금, 장비는 equipment.v2 로 지급.
    const goldGain = def.reward.gold ?? 0;
    const heldGold = Math.max(0, charSave.gold ?? 0);
    let bankedGold = Math.max(0, charSave.bankedGold ?? 0);
    if (goldGain > 0) {
      bankedGold += goldGain;
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        bankedGold,
      });
    }
    let grantedEquip: string | null = null;
    if (def.reward.equip) {
      const { owned, equipped } = parseEquipmentSave(equipSave);
      const iid = genEquipIid();
      await upsertSave(tx, userId, "equipment.v2", {
        owned: [...owned, { iid, id: def.reward.equip }],
        equipped,
      });
      grantedEquip = def.reward.equip;
    }
    let grantedTitle: string | null = null;
    if (def.reward.titleId) {
      await grantTitleIfMissingInTx(tx, userId, def.reward.titleId, Date.now());
      grantedTitle = def.reward.titleId;
    }
    // 스태미나 회복약(stamina-potions.v1) — 항상 마지막 잠금(leaf). 번들 보상과 동일 소비템.
    let grantedPotions = 0;
    if (def.reward.staminaPotions && def.reward.staminaPotions > 0) {
      const count = staminaPotionCount(
        await lockSaveForUpdate(tx, userId, STAMINA_POTIONS_KEY, { count: 0 }),
      );
      grantedPotions = def.reward.staminaPotions;
      await upsertSave(tx, userId, STAMINA_POTIONS_KEY, {
        count: count + grantedPotions,
      });
    }

    claimed.add(def.id);
    await upsertSave(tx, userId, GUIDE_QUESTS_KEY, {
      claimed: [...claimed],
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        questId: def.id,
        reward: {
          gold: goldGain,
          equip: grantedEquip,
          staminaPotions: grantedPotions,
          titleId: grantedTitle,
        },
        gold: heldGold,
        bankedGold,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
