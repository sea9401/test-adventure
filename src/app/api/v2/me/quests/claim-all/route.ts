import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  recordEconomyEventSoon,
  recordRewardFailureSoon,
} from "@/lib/server/economyLog";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import {
  buildQuestCtx,
  assembleQuestExtras,
  parseClaimed,
  GUIDE_QUESTS_KEY,
} from "@/lib/server/v2QuestContext";
import {
  V2_QUESTS,
  isQuestClaimable,
  isTutorialLine,
} from "@/adventure/data/v2/v2Quests";
import {
  parseEquipmentSave,
  type EquipmentSave,
} from "@/adventure/data/v2/v2Equipment";
import { mintEquipInstance } from "@/adventure/data/v2/v2EquipMint";
import {
  STAMINA_POTIONS_KEY,
  staminaPotionCount,
} from "@/adventure/v2/staminaPotions";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import { FARM_SAVE_KEY } from "@/adventure/v2/farm";
import { WOODCUTTING_LOG_KEY } from "@/adventure/v2/woodcuttingSession";
import { MINING_LOG_KEY } from "@/adventure/v2/miningSession";
import { FISHING_PROGRESS_KEY } from "@/adventure/v2/fishingProgression";
import { EQUIPMENT_CODEX_KEY } from "@/adventure/data/v2/equipmentCodex";
import { MASTERY_TOWER_SAVE_KEY } from "@/adventure/data/v2/masteryTower";
import { COOKING_SAVE_KEY } from "@/adventure/v2/cooking";

type ClaimAllScope = "tutorial" | "achievement";

function isClaimAllScope(value: unknown): value is ClaimAllScope {
  return value === "tutorial" || value === "achievement";
}

// POST /api/v2/me/quests/claim-all { scope: "tutorial"|"achievement" }
// 버튼을 누른 시점에 해당 탭에서 보이는 수령 가능 항목만 서버가 다시 계산해 한 트랜잭션으로 지급한다.
// 체인의 숨겨진 다음 단계는 최초 claimed 스냅샷에서 claimable 이 아니므로 이번 묶음에 포함되지 않는다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { scope?: unknown };
  try {
    body = (await req.json()) as { scope?: unknown };
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!isClaimAllScope(body.scope)) {
    return Response.json(
      { ok: false, error: "invalid_scope" },
      { status: 400 },
    );
  }
  const scope = body.scope;

  const result = await db.transaction(async (tx) => {
    // 기존 단건 수령과 같은 잠금 순서를 유지한다. 포션 저장소는 칭호 지급 뒤 마지막에 잠근다.
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
    const farmRaw = await readSave(tx, userId, FARM_SAVE_KEY, {});
    const woodcuttingRaw = await readSave(tx, userId, WOODCUTTING_LOG_KEY, {});
    const miningRaw = await readSave(tx, userId, MINING_LOG_KEY, {});
    const fishingProgressRaw = await readSave(
      tx,
      userId,
      FISHING_PROGRESS_KEY,
      {},
    );
    const equipmentCodexRaw = await readSave(
      tx,
      userId,
      EQUIPMENT_CODEX_KEY,
      {},
    );
    const masteryTowerRaw = await readSave(
      tx,
      userId,
      MASTERY_TOWER_SAVE_KEY,
      {},
    );
    const cookingRaw = await readSave(tx, userId, COOKING_SAVE_KEY, {});
    const extras = await assembleQuestExtras(tx, userId);

    const ctx = buildQuestCtx({
      charRaw: charSave,
      proficiencyRaw,
      advLogRaw,
      equipmentRaw: equipSave,
      skillsRaw,
      craftingRaw,
      farmRaw,
      woodcuttingRaw,
      miningRaw,
      fishingProgressRaw,
      equipmentCodexRaw,
      masteryTowerRaw,
      cookingRaw,
      extras,
    });
    const claimed = parseClaimed(guideSave);
    const tutorial = scope === "tutorial";
    const claimable = V2_QUESTS.filter(
      (quest) =>
        isTutorialLine(quest.line) === tutorial &&
        isQuestClaimable(quest, ctx, claimed),
    );

    if (claimable.length === 0) {
      return {
        status: 409,
        body: { ok: false as const, error: "nothing_to_claim" as const },
        details: [],
      };
    }

    const gold = claimable.reduce(
      (sum, quest) => sum + Math.max(0, quest.reward.gold ?? 0),
      0,
    );
    if (gold > 0) {
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        bankedGold: Math.max(0, charSave.bankedGold ?? 0) + gold,
      });
    }

    const equipment = claimable.flatMap((quest) =>
      quest.reward.equip ? [quest.reward.equip] : [],
    );
    if (equipment.length > 0) {
      const parsed = parseEquipmentSave(equipSave);
      await upsertSave(tx, userId, "equipment.v2", {
        owned: [
          ...parsed.owned,
          ...equipment.map((id) => mintEquipInstance(id)),
        ],
        equipped: parsed.equipped,
      });
    }

    const titleIds: string[] = [];
    const obtainedAt = Date.now();
    for (const quest of claimable) {
      const titleId = quest.reward.titleId;
      if (
        titleId &&
        (await grantTitleIfMissingInTx(tx, userId, titleId, obtainedAt))
      ) {
        titleIds.push(titleId);
      }
    }

    const staminaPotions = claimable.reduce(
      (sum, quest) =>
        sum + Math.max(0, quest.reward.staminaPotions ?? 0),
      0,
    );
    if (staminaPotions > 0) {
      const count = staminaPotionCount(
        await lockSaveForUpdate(tx, userId, STAMINA_POTIONS_KEY, { count: 0 }),
      );
      await upsertSave(tx, userId, STAMINA_POTIONS_KEY, {
        count: count + staminaPotions,
      });
    }

    for (const quest of claimable) claimed.add(quest.id);
    await upsertSave(tx, userId, GUIDE_QUESTS_KEY, {
      claimed: [...claimed],
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        count: claimable.length,
        reward: { gold, equipment, staminaPotions, titleIds },
      },
      details: claimable.map((quest) => ({
        questId: quest.id,
        gold: Math.max(0, quest.reward.gold ?? 0),
        equip: quest.reward.equip ?? null,
        staminaPotions: Math.max(0, quest.reward.staminaPotions ?? 0),
      })),
    };
  });

  if (result.status === 200 && result.body.ok) {
    for (const detail of result.details) {
      if (detail.gold > 0) {
        recordEconomyEventSoon({
          userId,
          eventType: "reward.quest.gold",
          goldDelta: detail.gold,
          itemKind: "gold",
          quantity: detail.gold,
          detail: { questId: detail.questId, claimMode: "all" },
        });
      }
      if (detail.equip) {
        recordEconomyEventSoon({
          userId,
          eventType: "reward.quest.equip",
          itemKind: "equip",
          itemId: detail.equip,
          quantity: 1,
          detail: { questId: detail.questId, claimMode: "all" },
        });
      }
      if (detail.staminaPotions > 0) {
        recordEconomyEventSoon({
          userId,
          eventType: "reward.quest.stamina_potion",
          itemKind: "stamina_potion",
          quantity: detail.staminaPotions,
          detail: { questId: detail.questId, claimMode: "all" },
        });
      }
    }
  } else if (!result.body.ok) {
    recordRewardFailureSoon({
      userId,
      source: "quest_all",
      error: result.body.error,
      detail: { scope, status: result.status },
    });
  }

  return Response.json(result.body, { status: result.status });
}
