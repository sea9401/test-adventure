import "server-only";

// NPC 대화 보상 서버 lib — /api/npc/dialogue-reward 의 핵심 로직.
//
// 권위: 서버. 클라는 dialogueId 만 보내고, 서버가 character.v2 / inventory.v2 /
// storyFlags.v2 를 잠그고 reward 정의 (DIALOGUE_REWARDS) 대로 mutate 한 뒤 새 saves
// 를 응답에 담아 반환. 클라는 각 hook 의 replaceFromSaved 로 통째 교체.
//
// 1회성 dedup: reward.storyFlag 가 이미 박혀 있으면 idempotent no-op — 응답 손실 후
// retry 안전. (코옵 claim 의 snapshot 패턴과 같은 결.)

import { and, eq, inArray } from "drizzle-orm";
import { savesKv } from "@/db/schema";
import {
  DIALOGUE_REWARDS,
  type DialogueReward,
  type DialogueRewardId,
} from "@/adventure/data/dialogueRewards";
import { potionMax, type PotionId } from "@/adventure/data/potions";
import { upsertSave, type DbExecutor } from "@/lib/server/savesKv";
import { STORY_FLAGS_STORAGE_KEY } from "@/adventure/storyFlags/storage";

const REWARD_SAVES_KEYS = [
  "character.v2",
  "inventory.v2",
  STORY_FLAGS_STORAGE_KEY,
] as const;

export type DialogueRewardSavesSnapshot = Partial<
  Record<(typeof REWARD_SAVES_KEYS)[number], unknown>
>;

async function readSavesForUpdate(
  tx: DbExecutor,
  userId: string,
): Promise<DialogueRewardSavesSnapshot> {
  const rows = await tx
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        eq(savesKv.userId, userId),
        inArray(savesKv.key, REWARD_SAVES_KEYS as unknown as string[]),
      ),
    )
    .for("update");
  const out: DialogueRewardSavesSnapshot = {};
  for (const r of rows) {
    if ((REWARD_SAVES_KEYS as readonly string[]).includes(r.key)) {
      out[r.key as keyof DialogueRewardSavesSnapshot] = r.value;
    }
  }
  return out;
}

function applyCharacterReward(
  char: Record<string, unknown>,
  reward: DialogueReward,
): Record<string, unknown> {
  const gold = typeof char.gold === "number" ? char.gold : 0;
  const fame = typeof char.fame === "number" ? char.fame : 0;
  const exp = typeof char.exp === "number" ? char.exp : 0;
  const next = { ...char };
  let changed = false;
  if (reward.gold) {
    next.gold = gold + reward.gold;
    changed = true;
  }
  if (reward.fame) {
    next.fame = fame + reward.fame;
    changed = true;
  }
  if (reward.exp) {
    next.exp = exp + reward.exp;
    changed = true;
  }
  return changed ? next : char;
}

function applyInventoryReward(
  inv: Record<string, unknown>,
  reward: DialogueReward,
): Record<string, unknown> {
  let next = inv;
  let changed = false;
  if (reward.materials) {
    const cur =
      (next.materials as Record<string, number> | undefined) ?? {};
    const nm = { ...cur };
    for (const [id, n] of Object.entries(reward.materials)) {
      if (!n) continue;
      nm[id] = (nm[id] ?? 0) + n;
      changed = true;
    }
    next = { ...next, materials: nm };
  }
  if (reward.equipment && reward.equipment.length > 0) {
    const cur = (next.equipment as Record<string, number> | undefined) ?? {};
    const ne = { ...cur };
    for (const id of reward.equipment) {
      ne[id] = (ne[id] ?? 0) + 1;
      changed = true;
    }
    next = { ...next, equipment: ne };
  }
  if (reward.potions) {
    const curPotions =
      (next.potions as Record<string, number> | undefined) ?? {};
    const cap = potionMax(
      typeof next.potionCapacityBonus === "number"
        ? next.potionCapacityBonus
        : 0,
    );
    const np = { ...curPotions };
    for (const [id, n] of Object.entries(reward.potions)) {
      if (!n) continue;
      const have = np[id] ?? 0;
      const room = Math.max(0, cap - have);
      const added = Math.min(n, room);
      if (added > 0) {
        np[id as PotionId] = have + added;
        changed = true;
      }
    }
    next = { ...next, potions: np };
  }
  return changed ? next : inv;
}

function applyStoryFlag(
  flags: Record<string, unknown>,
  flagId: string,
): Record<string, unknown> {
  const arr = Array.isArray(flags.flags) ? (flags.flags as string[]) : [];
  if (arr.includes(flagId)) return flags;
  return { ...flags, flags: [...arr, flagId] };
}

export class DialogueRewardError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "DialogueRewardError";
  }
}

export type DialogueRewardOutcome = {
  /** 이번 호출이 실제로 적용했는지. false 면 이미 storyFlag 박힌 idempotent retry. */
  applied: boolean;
  reward: DialogueReward;
  saves: DialogueRewardSavesSnapshot;
};

// 트랜잭션 안에서 호출. 3 키 잠금 → flag 검사 → mutate → upsert.
export async function applyDialogueReward(
  tx: DbExecutor,
  userId: string,
  dialogueId: DialogueRewardId,
): Promise<DialogueRewardOutcome> {
  const reward = DIALOGUE_REWARDS[dialogueId];
  if (!reward) throw new DialogueRewardError("unknown_dialogue");

  const saves = await readSavesForUpdate(tx, userId);
  const flagsRaw =
    (saves[STORY_FLAGS_STORAGE_KEY] as Record<string, unknown> | undefined) ??
    {};
  const flagArr = Array.isArray(flagsRaw.flags)
    ? (flagsRaw.flags as string[])
    : [];

  // 이미 flag 박혀 있으면 idempotent — 적용 없이 현재 saves 그대로 반환.
  if (flagArr.includes(reward.storyFlag)) {
    return { applied: false, reward, saves };
  }

  const charPrev =
    (saves["character.v2"] as Record<string, unknown> | undefined) ?? {};
  const invPrev =
    (saves["inventory.v2"] as Record<string, unknown> | undefined) ?? {};

  const charNext = applyCharacterReward(charPrev, reward);
  const invNext = applyInventoryReward(invPrev, reward);
  const flagsNext = applyStoryFlag(flagsRaw, reward.storyFlag);

  if (charNext !== charPrev) {
    await upsertSave(tx, userId, "character.v2", charNext);
  }
  if (invNext !== invPrev) {
    await upsertSave(tx, userId, "inventory.v2", invNext);
  }
  if (flagsNext !== flagsRaw) {
    await upsertSave(tx, userId, STORY_FLAGS_STORAGE_KEY, flagsNext);
  }

  return {
    applied: true,
    reward,
    saves: {
      "character.v2": charNext,
      "inventory.v2": invNext,
      [STORY_FLAGS_STORAGE_KEY]: flagsNext,
    },
  };
}
