import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import {
  buildQuestCtx,
  buildRepeatSignals,
  assembleQuestExtras,
  parseClaimed,
  GUIDE_QUESTS_KEY,
  REPEAT_QUESTS_KEY,
} from "@/lib/server/v2QuestContext";
import { questById, isQuestClaimable } from "@/adventure/data/v2/v2Quests";
import {
  deriveRepeatViews,
  parseRepeatSave,
  repeatQuestById,
  rolloverRepeatSave,
} from "@/adventure/data/v2/v2RepeatQuests";
import {
  parseEquipmentSave,
  genEquipIid,
  type EquipmentSave,
} from "@/adventure/data/v2/v2Equipment";

// POST /api/v2/me/quests/claim  { questId } — 가이드 퀘스트 보상 수령.
//   서버가 세이브에서 완료를 재판정(클라 신뢰 안 함) + 미수령 확인 → 보상 지급 + claimed 기록.
//   락 순서 character.v2 → equipment.v2 → guide-quests.v2 (proficiency·adventure-log 은 무락 read).
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

  // 반복 퀘스트 분기 — 가이드와 저장 키/판정 모델이 달라 별도 tx.
  const repeatDef = questId ? repeatQuestById(questId) : undefined;
  if (repeatDef) {
    const result = await db.transaction(async (tx) => {
      // 락 순서: character.v2(보상) → repeat-quests.v2. 판정 입력(adventure-log·extras)은 무락.
      const charSave = await lockSaveForUpdate<{ gold?: number }>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const repeatSaveRaw = await lockSaveForUpdate<unknown>(
        tx,
        userId,
        REPEAT_QUESTS_KEY,
        {},
      );
      const advLogRaw = await readSave(tx, userId, "adventure-log.v2", {});
      const extras = await assembleQuestExtras(tx, userId);
      const now = new Date();
      const signals = buildRepeatSignals(advLogRaw, extras);
      const rolled = rolloverRepeatSave(
        parseRepeatSave(repeatSaveRaw),
        now,
        signals,
      );
      const view = deriveRepeatViews(rolled.save, signals).find(
        (q) => q.id === repeatDef.id,
      );
      if (!view || view.claimed) {
        return {
          status: 409,
          body: { ok: false as const, error: "already_claimed" as const },
        };
      }
      if (!view.claimable) {
        return {
          status: 400,
          body: { ok: false as const, error: "not_complete" as const },
        };
      }
      const period =
        repeatDef.scope === "daily" ? rolled.save.daily! : rolled.save.weekly!;
      period.claimed = [...period.claimed, repeatDef.id];
      const gold = Math.max(0, (charSave.gold ?? 0) + repeatDef.reward.gold);
      await upsertSave(tx, userId, "character.v2", { ...charSave, gold });
      await upsertSave(tx, userId, REPEAT_QUESTS_KEY, rolled.save);
      return {
        status: 200,
        body: {
          ok: true as const,
          questId: repeatDef.id,
          reward: { gold: repeatDef.reward.gold, equip: null },
          gold,
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  }

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
      unlockedPassives?: unknown;
      gold?: number;
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
    const extras = await assembleQuestExtras(tx, userId);

    const ctx = buildQuestCtx({
      charRaw: charSave,
      proficiencyRaw,
      advLogRaw,
      equipmentRaw: equipSave,
      extras,
    });
    const claimed = parseClaimed(guideSave);

    if (claimed.has(def.id)) {
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

    // 보상 지급 — 골드(character.v2) + 장비 개체(equipment.v2, 굴림 없이 카탈로그 스탯).
    const goldGain = def.reward.gold ?? 0;
    if (goldGain > 0) {
      const gold = Math.max(0, (charSave.gold ?? 0) + goldGain);
      await upsertSave(tx, userId, "character.v2", { ...charSave, gold });
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

    claimed.add(def.id);
    await upsertSave(tx, userId, GUIDE_QUESTS_KEY, {
      claimed: [...claimed],
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        questId: def.id,
        reward: { gold: goldGain, equip: grantedEquip },
        gold: Math.max(0, (charSave.gold ?? 0) + goldGain),
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
