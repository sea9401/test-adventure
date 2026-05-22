// 서버측 PlayerCombat 재계산 — 저장된 character.v2 + training.v2 를 읽어 같은 derive 를 돌린다.
// 협동 보스 등 신뢰가 필요한 경로에서 클라가 보낸 PlayerCombat 을 무시하고 이 결과를 사용.

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import type { DbExecutor } from "@/lib/server/savesKv";
import { baseCharacter } from "@/adventure/character/defaults";
import {
  derivePlayerCombat,
  type DerivedPlayerCombat,
} from "@/adventure/character/derivePlayerCombat";
import { rehydrateEquippedItem } from "@/adventure/character/rehydrateEquip";
import { normalizeStance, type StanceId } from "@/adventure/character/stance";
import type { EquippedItem } from "@/adventure/character/types";
import {
  isWellFormedRuneSlot,
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
  /** 선택한 전술(스탠스). 보스/특수 전투에만 적용 — 호출부가 applyStance 로 게이팅. */
  selectedStance?: unknown;
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
  executor: DbExecutor,
  userId: string,
  keys: readonly string[],
): Promise<Record<string, unknown>> {
  const rows = await executor
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), inArray(savesKv.key, keys)));
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

// 호출자가 이미 트랜잭션 안이라면 그 tx 를 넘겨야 같은 커넥션에서 읽힌다. 별도 db
// 커넥션을 쓰면 호출자가 잠근 saves_kv 행을 새 커넥션이 SELECT 하다 잠금 대기에
// 걸려, 호출자 tx 가 그 await 결과를 기다리며 self-deadlock 후보가 된다.
/** derive 결과 + 저장된 전술. 전술은 적용하지 않고 그대로 전달 — 호출부가
 *  보스/특수 전투에서만 applyStance 로 게이팅 적용한다(비특수 경로 보호). */
export type DerivedPlayerCombatFromSaves = DerivedPlayerCombat & {
  selectedStance: StanceId | null;
};

export async function derivePlayerCombatFromSaves(
  userId: string,
  executor: DbExecutor = db,
): Promise<DerivedPlayerCombatFromSaves | null> {
  const saves = await readSavesBatch(executor, userId, [
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

  const derived = derivePlayerCombat({
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
  return { ...derived, selectedStance: normalizeStance(character.selectedStance) };
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
// 모양이 멀쩡하면 미인식 id/grade 라도 보존(carry-through), 진짜 손상만 null.
// 미인식 룬의 전투 기여는 computeRuneBonus/getRuneMagnitude 가 0 으로 무력화한다.
function rehydrateEquippedRunes(
  saved: unknown,
): (EquippedRune | null)[] | undefined {
  if (!Array.isArray(saved)) return undefined;
  const out: (EquippedRune | null)[] = [];
  for (let i = 0; i < Math.min(saved.length, RUNE_SLOT_COUNT); i += 1) {
    const v = saved[i];
    out.push(isWellFormedRuneSlot(v) ? { id: v.id, grade: v.grade } : null);
  }
  return out;
}
