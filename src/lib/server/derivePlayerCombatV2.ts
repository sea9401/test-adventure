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
  type EquippedItemForDerive,
} from "@/adventure/character/derivePlayerCombat";
import { rehydrateEquippedItem } from "@/adventure/character/rehydrateEquip";
import { normalizeStance, type StanceId } from "@/adventure/character/stance";
import type { EquippedItem } from "@/adventure/character/types";
import { STAT_KEYS, type StatKey } from "@/adventure/data/stats";
import { normalizeEquippedSpells } from "@/adventure/data/v2/spells";
import {
  V2_EQUIPMENT,
  parseEquipmentSave,
  type V2Equipment,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";

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

// V2Equipment → derive 가 받을 minimal EquippedItemForDerive 로 변환.
// derive 는 bonus(6스탯 + atk/def) 만 읽으므로, 표시용 stats/description 은 빈 값/스킵
// 으로 두고 enchantSlots 도 비운다 — v2 결정상 마법부여 시스템은 폐기.
//
// 단위 테스트가 derive 합산을 검증할 수 있도록 export.
export function v2ToDeriveItem(item: V2Equipment): EquippedItemForDerive {
  return {
    name: item.name,
    slot: item.slot,
    stats: [],
    bonus: { ...item.stats },
  };
}

type DeriveEquippedSlots = {
  weapon: EquippedItemForDerive | null;
  armor: EquippedItemForDerive | null;
  accessory: EquippedItemForDerive | null;
};

// 슬롯 병합 — v2 저장소(equipment.v2) 에 v2 장비가 있는 슬롯은 라이브 잔존 슬롯을
// 덮어쓴다. 라이브 슬롯이 채워지는 경로는 v2 결정상 사실상 없지만, 마이그레이션
// 중간 상태에서 데이터가 남아 있을 가능성을 위해 v2 없는 슬롯은 라이브 fallback.
//
// 단위 테스트가 우선순위 로직을 검증할 수 있도록 export.
export function pickV2OrLiveSlots(
  v2Equipped: Partial<Record<V2EquipSlot, V2Equipment["id"]>>,
  liveEquipped: DeriveEquippedSlots,
): DeriveEquippedSlots {
  const v2ForSlot = (slot: V2EquipSlot): EquippedItemForDerive | null => {
    const id = v2Equipped[slot];
    return id ? v2ToDeriveItem(V2_EQUIPMENT[id]) : null;
  };
  return {
    weapon: v2ForSlot("weapon") ?? liveEquipped.weapon,
    armor: v2ForSlot("armor") ?? liveEquipped.armor,
    accessory: v2ForSlot("accessory") ?? liveEquipped.accessory,
  };
}

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
        inArray(savesKv.key, [
          "character.v2",
          "training.v2",
          "equipment.v2",
        ]),
      ),
    );

  let character: SavedCharacterV2 | undefined;
  let training: SavedTrainingV2 = {};
  let equipmentSave: unknown = undefined;
  for (const r of rows) {
    if (r.key === "character.v2") character = r.value as SavedCharacterV2;
    else if (r.key === "training.v2") training = (r.value ?? {}) as SavedTrainingV2;
    else if (r.key === "equipment.v2") equipmentSave = r.value;
  }
  if (!character) return null;

  const allocatedStats: Record<StatKey, number> = STAT_KEYS.reduce(
    (acc, k) => {
      acc[k] = training.allocated?.[k] ?? 0;
      return acc;
    },
    { str: 0, dex: 0, vit: 0, spd: 0, luk: 0, int: 0 } as Record<StatKey, number>,
  );

  // 라이브 character.v2.equipped (라이브 ITEMS catalog 잔존 슬롯) — v2 결정상 라이브
  // 장비 시스템 폐기이므로 사실상 비어 있다. 안전상 rehydrate 는 유지하되 v2 장비와 함께
  // 한 슬롯에 덮어쓰지 않도록 — equipment.v2 가 채우면 그게 우선.
  const savedEquipped = character.equipped ?? null;
  const liveEquipped = {
    weapon: rehydrateEquippedItem(savedEquipped?.weapon),
    armor: rehydrateEquippedItem(savedEquipped?.armor),
    accessory: rehydrateEquippedItem(savedEquipped?.accessory),
  };

  // equipment.v2 의 슬롯별 장착 → V2_EQUIPMENT 룩업 → minimal EquippedItemForDerive 변환.
  // V2 장비가 있는 슬롯은 라이브 슬롯을 덮어쓴다 (v2 결정: 라이브 시스템 폐기).
  const { equipped: v2Equipped } = parseEquipmentSave(equipmentSave);
  const equipped = pickV2OrLiveSlots(v2Equipped, liveEquipped);

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
