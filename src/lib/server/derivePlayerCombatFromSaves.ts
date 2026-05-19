// 서버측 PlayerCombat 재계산 — 저장된 character.v2 + training.v2 를 읽어 같은 derive 를 돌린다.
// 협동 보스 등 신뢰가 필요한 경로에서 클라가 보낸 PlayerCombat 을 무시하고 이 결과를 사용.

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { baseCharacter } from "@/adventure/character/defaults";
import {
  derivePlayerCombat,
  type DerivedPlayerCombat,
} from "@/adventure/character/derivePlayerCombat";
import { rehydrateEquippedItem } from "@/adventure/character/rehydrateEquip";
import type { EquippedItem } from "@/adventure/character/types";
import {
  isRuneGrade,
  isRuneId,
  RUNE_SLOT_COUNT,
  type EquippedRune,
} from "@/adventure/data/runes";
import { STAT_KEYS, type StatKey } from "@/adventure/data/stats";
import { STORY_FLAGS_STORAGE_KEY } from "@/adventure/storyFlags/storage";
import {
  isAPSkillCondition,
  type APSkillCondition,
} from "@/adventure/character/apSkills";
import { readInitialParagon } from "@/lib/paragon";

type SavedEquipped = {
  weapon?: EquippedItem | null;
  armor?: EquippedItem | null;
  accessory?: EquippedItem | null;
};

type SavedCharacterV2 = {
  hp?: number;
  level?: number;
  equipped?: SavedEquipped | null;
  equippedSkills?: string[];
  /** 신 포맷 — 슬롯 인덱스 별 특기. */
  equippedFeats?: (string | null)[];
  /** 레거시 — 단일 특기 슬롯 시절 필드. 읽기 호환만. */
  equippedFeat?: string;
  /** 장착 룬 — 슬롯 인덱스 별. null = 비움. */
  equippedRunes?: ({ id: string; grade: number } | null)[];
  /** 학습한 AP 스킬 이름 — equippedSkills 와 교집합이 실제 장착 AP 스킬. */
  learnedAPSkills?: string[];
  /** AP 스킬 슬롯의 발동 조건 맵 — skillName 키. 미지정 = always. */
  apSkillConditions?: Record<string, unknown>;
};

type SavedTrainingV2 = {
  allocated?: Partial<Record<StatKey, number>>;
};

type SavedStoryFlagsV2 = {
  flags?: string[];
};

// 4 키를 한 번의 `key IN (...)` 쿼리로 가져온다. 시리얼 await 4 회는 코옵 보스 1 공격당
// 4 round-trip 누적 — 100+ 동시 참여자 시점에 보스 카드 폴링과 합쳐 부하 누적.
async function readSavesBatch(
  userId: string,
  keys: readonly string[],
): Promise<Record<string, unknown>> {
  const rows = await db
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), inArray(savesKv.key, keys)));
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function derivePlayerCombatFromSaves(
  userId: string,
): Promise<DerivedPlayerCombat | null> {
  const saves = await readSavesBatch(userId, [
    "character.v2",
    "training.v2",
    STORY_FLAGS_STORAGE_KEY,
    "paragon.v1",
  ]);
  const character = saves["character.v2"] as SavedCharacterV2 | undefined;
  if (!character) return null;

  const training = (saves["training.v2"] as SavedTrainingV2 | undefined) ?? {};
  const storyFlags =
    (saves[STORY_FLAGS_STORAGE_KEY] as SavedStoryFlagsV2 | undefined) ?? {};
  const storyFlagIds = new Set(
    Array.isArray(storyFlags.flags) ? storyFlags.flags : [],
  );

  const allocatedStats: Record<StatKey, number> = STAT_KEYS.reduce(
    (acc, k) => {
      acc[k] = training.allocated?.[k] ?? 0;
      return acc;
    },
    { str: 0, dex: 0, vit: 0, spd: 0, luk: 0 } as Record<StatKey, number>,
  );

  // ⚠️ 반드시 craftTier/dropQuality 까지 반영하는 공용 헬퍼를 써야 한다 — 베이스 아이템만
  // 돌려주면 걸작/빼어난 장비 보너스가 사라져 feat 임계치 위에 있던 빌드가 침묵 비활성화됨.
  const savedEquipped = character.equipped ?? null;
  const equipped = {
    weapon: rehydrateEquippedItem(savedEquipped?.weapon),
    armor: rehydrateEquippedItem(savedEquipped?.armor),
    accessory: rehydrateEquippedItem(savedEquipped?.accessory),
  };

  // 레거시 equippedFeat (단일 string) → 배열 정규화. 클라이언트 readInitial 과 동일.
  const equippedFeats =
    character.equippedFeats ??
    (character.equippedFeat ? [character.equippedFeat] : undefined);

  const equippedRunes = rehydrateEquippedRunes(character.equippedRunes);

  const learnedAPSkills = Array.isArray(character.learnedAPSkills)
    ? character.learnedAPSkills.filter((x): x is string => typeof x === "string")
    : undefined;

  const apSkillConditions = parseSavedAPSkillConditions(
    character.apSkillConditions,
  );

  const paragon = readInitialParagon(saves["paragon.v1"]);

  return derivePlayerCombat({
    level: character.level ?? 1,
    baseStats: baseCharacter.stats,
    allocatedStats,
    equipped,
    equippedSkills: character.equippedSkills,
    equippedFeats,
    equippedRunes,
    learnedAPSkills,
    apSkillConditions,
    storyFlagIds,
    paragonAllocations: paragon.allocations,
    hp: character.hp ?? baseCharacter.hp,
  });
}

function parseSavedAPSkillConditions(
  raw: unknown,
): Partial<Record<string, APSkillCondition>> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Partial<Record<string, APSkillCondition>> = {};
  for (const [name, cond] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof name === "string" && isAPSkillCondition(cond)) {
      out[name] = cond;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// 서버측 룬 슬롯 정규화 — 클라이언트의 rehydrateEquippedRunes 와 동일 규칙.
// 부정확하거나 정의 안 된 룬은 null 처리.
function rehydrateEquippedRunes(
  saved: unknown,
): (EquippedRune | null)[] | undefined {
  if (!Array.isArray(saved)) return undefined;
  const out: (EquippedRune | null)[] = [];
  for (let i = 0; i < Math.min(saved.length, RUNE_SLOT_COUNT); i += 1) {
    const v = saved[i] as { id?: unknown; grade?: unknown } | null | undefined;
    if (
      v &&
      typeof v === "object" &&
      typeof v.id === "string" &&
      isRuneId(v.id) &&
      typeof v.grade === "number" &&
      isRuneGrade(v.grade)
    ) {
      out.push({ id: v.id, grade: v.grade });
    } else {
      out.push(null);
    }
  }
  return out;
}
