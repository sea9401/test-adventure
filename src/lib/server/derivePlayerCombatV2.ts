// v2 전용 PlayerCombat derive — 라이브 derivePlayerCombatFromSaves 와 격리.
//
// v2 결정(docs/v2-item-skill-design.md, 2026-05-26)으로 폐기된 라이브 시스템들의 효과를
// 입력에서 빈 값으로 박아 차단한다:
//   - 룬 (equippedRunes)
//   - 일반 스킬 (equippedSkills)
//   - 6티어 특기 (equippedFeats)
//   - AP 스킬 (learnedAPSkills, apSkillConditions)
//   - 파라곤 (paragonAllocations)
//   - 스토리 플래그 기반 슬롯 해금 (storyFlagIds)
//
// 마법부여(enchant) 는 equipped item 안 enchantSlots 에 들어 있어 input 분리만으론
// 차단 불가. 후속 PR 에서 item-level 처리.
//
// 1차 PR 의 목적: 라이브 derive 와 분리해 v2 코드패스가 안전하게 격리됨을 보장.
// INT/MP/마법 액티브는 후속 PR (PR-2~5) 에서 derivePlayerCombat 자체에 분기 추가
// 또는 v2 전용 derive 본체 신규로 처리.

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
import { STAT_KEYS, type StatKey } from "@/adventure/data/stats";
import { normalizeEquippedSpells } from "@/adventure/data/v2/spells";

type SavedEquipped = {
  weapon?: EquippedItem | null;
  armor?: EquippedItem | null;
  accessory?: EquippedItem | null;
};

type SavedCharacterV2 = {
  hp?: number;
  level?: number;
  equipped?: SavedEquipped | null;
  selectedStance?: unknown;
  // v2 마법 장착 슬롯 (PR-5). SpellId[] — 미저장이면 빈 배열로 정규화.
  equippedSpells?: unknown;
};

type SavedTrainingV2 = {
  allocated?: Partial<Record<StatKey, number>>;
};

export type DerivedPlayerCombatV2 = DerivedPlayerCombat & {
  selectedStance: StanceId | null;
};

const EMPTY_STORY_FLAGS: ReadonlySet<string> = new Set<string>();

export async function derivePlayerCombatV2(
  userId: string,
  executor: DbExecutor = db,
): Promise<DerivedPlayerCombatV2 | null> {
  const rows = await executor
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        eq(savesKv.userId, userId),
        inArray(savesKv.key, ["character.v2", "training.v2"]),
      ),
    );

  let character: SavedCharacterV2 | undefined;
  let training: SavedTrainingV2 = {};
  for (const r of rows) {
    if (r.key === "character.v2") character = r.value as SavedCharacterV2;
    else if (r.key === "training.v2") training = (r.value ?? {}) as SavedTrainingV2;
  }
  if (!character) return null;

  const allocatedStats: Record<StatKey, number> = STAT_KEYS.reduce(
    (acc, k) => {
      acc[k] = training.allocated?.[k] ?? 0;
      return acc;
    },
    { str: 0, dex: 0, vit: 0, spd: 0, luk: 0, int: 0 } as Record<StatKey, number>,
  );

  const savedEquipped = character.equipped ?? null;
  const equipped = {
    weapon: rehydrateEquippedItem(savedEquipped?.weapon),
    armor: rehydrateEquippedItem(savedEquipped?.armor),
    accessory: rehydrateEquippedItem(savedEquipped?.accessory),
  };

  const derived = derivePlayerCombat({
    level: character.level ?? 1,
    baseStats: baseCharacter.stats,
    allocatedStats,
    equipped,
    // v2 결정 — 라이브 시스템 효과 차단 (전부 빈 값)
    equippedSkills: [],
    equippedFeats: [],
    equippedRunes: undefined,
    learnedAPSkills: undefined,
    apSkillConditions: undefined,
    storyFlagIds: EMPTY_STORY_FLAGS,
    paragonAllocations: {},
    hp: character.hp ?? baseCharacter.hp,
  });
  // v2 마법 슬롯 정규화 — 학습 가능·중복 제거·슬롯 cap. cap 은 라이브 layout.normalSlots
  // 와 공유 ("스킬 슬롯 공유" 결정). derive 가 layout 까지 만들어 noremalSlots 박음.
  const intStat = derived.totalStats.int ?? 0;
  const slotCount = derived.layout.normalSlots;
  const equippedSpells = normalizeEquippedSpells(
    character.equippedSpells,
    intStat,
    slotCount,
  );
  // PlayerCombat 에 equippedSpells 박기 — engine 의 마법 sweep 이 이를 보고 발동.
  const playerWithSpells = { ...derived.player, equippedSpells };
  return {
    ...derived,
    player: playerWithSpells,
    selectedStance: normalizeStance(character.selectedStance),
  };
}
