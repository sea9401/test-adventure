// v2 전용 PlayerCombat derive — 라이브 derivePlayerCombat 호출 안 함.
//
// PR-S1 (5배 해상도): 6스탯 raw 값을 5배 스케일로 늘리고(레벨업당 5pt + 베이스/장비 ×5),
// 효과 계수는 1/5 로 줄임. 동일 빌드 최종 전투력은 그대로지만 미세 조정 해상도 5배.
// Codex 권고: 각 스탯 기여를 float 으로 누적 후 최종 단계에서만 floor.
// critChancePct 는 floor 제거 — 0.1%p 단위 허용 (해상도 이득 보존).
//
// 5배 스케일 6스탯 axis (옛 1pt 동등 = 새 5pt):
//   str → atk 주력 (atk += str×0.2)
//   dex → 회피 (eva += dex×0.1, cap 75) + 명중 (acc += dex×0.05)
//   vit → maxHp 주력 (vit×1), def 약화 (vit×0.1)
//   spd → 다중공격 확률, 선공권 (extra += spd×0.4%). atk 영향 X
//   luk → 치명 (crit += luk×0.1). 스킬 조건부 X — 항상 작동
//   int → maxMp (int×2). 마법 axis 는 PR-7
//
// 장비 stats:
//   - EquipBonus 부분 (atk/def + 6스탯) → 입력 합산. 6스탯은 ×5 스케일 (v2Equipment.ts)
//   - 추가 파생 (crit/mp/eva/hp) → 결과에 후-가산. 파생 단위는 스케일 변화 없음.
//
// DerivedPlayerCombat 인터페이스 호환 — 다운스트림 코드(api routes, V2CharacterScreen
// 등) 가 layout/runeBonus/characterSkills 같은 필드를 기대하므로 빈 값으로 채운다.
//
// v2 마법 슬롯 cap 은 layout.normalSlots 와 공유 — 라이브 skillLayout 수식 재사용.

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import type { DbExecutor } from "@/lib/server/savesKv";
import { maxHpForLevel } from "@/adventure/character/defaults";
import {
  baselineRegenFor,
  skillLayout,
} from "@/adventure/character/skills";
import { emptyRuneBonus } from "@/adventure/character/runeBonus";
import { normalizeStance, type StanceId } from "@/adventure/character/stance";
import {
  EVASION_PCT_CAP,
  STAT_KEYS,
  type StatKey,
} from "@/adventure/data/stats";
import { normalizeEquippedSpells } from "@/adventure/data/v2/spells";
import {
  V2_EQUIPMENT,
  parseEquipmentSave,
  type V2EquipmentId,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import type { PlayerCombat } from "@/adventure/battle/engine";
import type { DerivedPlayerCombat } from "@/adventure/character/derivePlayerCombat";

type SavedCharacterV2 = {
  hp?: number;
  level?: number;
  selectedStance?: unknown;
  equippedSpells?: unknown;
};

type SavedTrainingV2 = {
  allocated?: Partial<Record<StatKey, number>>;
};

export type DerivedPlayerCombatV2 = DerivedPlayerCombat & {
  selectedStance: StanceId | null;
};

// 장비 stats 합산 — equipment.v2 의 슬롯 3개에서 EquipBonus 부분(6스탯+atk/def) +
// 추가 파생(crit/mp/eva/hp) 누적. 단위 테스트가 검증할 수 있도록 export.
export type V2EquipAggregate = {
  // 6스탯 — derive 입력단에 합산
  str: number;
  dex: number;
  vit: number;
  spd: number;
  luk: number;
  int: number;
  // 파생 — derive 결과 후-가산
  atk: number;
  def: number;
  crit: number;
  mp: number;
  eva: number;
  hp: number;
};

const EMPTY_AGGREGATE = (): V2EquipAggregate => ({
  str: 0,
  dex: 0,
  vit: 0,
  spd: 0,
  luk: 0,
  int: 0,
  atk: 0,
  def: 0,
  crit: 0,
  mp: 0,
  eva: 0,
  hp: 0,
});

export function aggregateV2Equipment(
  v2Equipped: Partial<Record<V2EquipSlot, V2EquipmentId>>,
): V2EquipAggregate {
  const acc = EMPTY_AGGREGATE();
  for (const slot of ["weapon", "armor", "accessory"] as const) {
    const id = v2Equipped[slot];
    if (!id) continue;
    const s = V2_EQUIPMENT[id].stats;
    acc.str += s.str ?? 0;
    acc.dex += s.dex ?? 0;
    acc.vit += s.vit ?? 0;
    acc.spd += s.spd ?? 0;
    acc.luk += s.luk ?? 0;
    acc.int += s.int ?? 0;
    acc.atk += s.atk ?? 0;
    acc.def += s.def ?? 0;
    acc.crit += s.crit ?? 0;
    acc.mp += s.mp ?? 0;
    acc.eva += s.eva ?? 0;
    acc.hp += s.hp ?? 0;
  }
  return acc;
}

// PR-S1 5배 스케일 다이얼 — 각 계수 = 옛값 / 5.
// 모두 float — 합산은 derive 내부에서 누적 후 최종 floor 한 번만.
const MP_PER_INT = 2; // 옛 10. 5×INT × 2 = 10 MP (동등)
const HP_PER_VIT = 1; // 옛 5.  5×VIT × 1 = 5 HP (동등)
const DEF_PER_VIT = 0.1; // 옛 0.5. 5×VIT × 0.1 = 0.5 DEF (동등)
const CRIT_PER_LUK = 0.1; // 옛 0.5%. 5×LUK × 0.1% = 0.5% (동등)
const ATK_PER_STR = 0.2; // 옛 1. 5×STR × 0.2 = 1 atk (동등)
const EVA_PER_DEX = 0.1; // 옛 0.5. 5×DEX × 0.1 = 0.5% (동등)
const ACCURACY_PCT_PER_DEX = 0.05; // 옛 0.25. 5×DEX × 0.05 = 0.25%p (동등)
// v2 전용 SPD 계수 — stats.ts 의 라이브 공용 EXTRA_ATTACK_PCT_PER_SPD(=2) 와 별도.
// 옛 v2 = 2%. 5×SPD × 0.4% = 2% (동등).
const EXTRA_ATK_PCT_PER_SPD = 0.4;

// PR-S1 v2 베이스 스탯 — 5배 스케일 (옛 라이브 {3,...} × 5). baseCharacter.stats 는
// 라이브 derive/arenaBots/autoHunt 가 공유 사용해 ×5 하면 라이브 측이 5× 강화돼 깨짐.
// 따라서 v2 전용 baseline 으로 분리. INT 만 0 유지 (마법 시스템 신규 스탯).
export const V2_BASE_STATS: Record<StatKey, number> = {
  str: 15,
  dex: 15,
  vit: 15,
  spd: 15,
  luk: 15,
  int: 0,
};

// PR-S1 5배 스케일 레벨업 grant — training.v2.points 에 (levelsGained × 5).
// 현재 v2 hunt route 만 사용. autoHunt·useLevelUpDetection 은 라이브 system 경로라
// dev 호환 위해 ×1 유지 (PR-S1 scope 외).
export const V2_STAT_POINTS_PER_LEVEL = 5;

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

  const level = Math.max(1, character.level ?? 1);
  const { equipped: v2Equipped } = parseEquipmentSave(equipmentSave);
  const equipAcc = aggregateV2Equipment(v2Equipped);

  // baseAllocatedStats = V2_BASE_STATS(×5) + training.allocated (장비 6스탯 제외).
  // baseCharacter.stats 대신 v2 전용 baseline 사용 — 라이브 baseline 과 분리.
  const baseAllocatedStats: Record<StatKey, number> = STAT_KEYS.reduce(
    (acc, k) => {
      acc[k] = (V2_BASE_STATS[k] ?? 0) + (training.allocated?.[k] ?? 0);
      return acc;
    },
    { str: 0, dex: 0, vit: 0, spd: 0, luk: 0, int: 0 } as Record<StatKey, number>,
  );
  // totalStats = baseAllocated + 장비 6스탯
  const totalStats: Record<StatKey, number> = STAT_KEYS.reduce(
    (acc, k) => {
      acc[k] = baseAllocatedStats[k] + equipAcc[k];
      return acc;
    },
    { str: 0, dex: 0, vit: 0, spd: 0, luk: 0, int: 0 } as Record<StatKey, number>,
  );

  // PR-S1 5배 스케일 — float 누적 후 atk/def/maxHp/maxMp 만 최종 floor.
  // crit/eva/acc/extraAtk 는 float 그대로 (엔진이 확률 비교만, 0.1%p 단위 보존).
  const atk = Math.floor(totalStats.str * ATK_PER_STR + equipAcc.atk);
  const def = Math.floor(totalStats.vit * DEF_PER_VIT + equipAcc.def);
  const maxHp = Math.floor(
    maxHpForLevel(level) + totalStats.vit * HP_PER_VIT + equipAcc.hp,
  );
  const maxMp = Math.floor(totalStats.int * MP_PER_INT + equipAcc.mp);
  const critChancePct = totalStats.luk * CRIT_PER_LUK + equipAcc.crit;
  const evasionPct = Math.min(
    totalStats.dex * EVA_PER_DEX + equipAcc.eva,
    EVASION_PCT_CAP,
  );
  const accuracyPct = Math.max(0, totalStats.dex * ACCURACY_PCT_PER_DEX);
  // spd 가 중갑 페널티로 음수가 될 수 있음. 엔진은 chance<=0 에서 base 공격으로
  // 클램프하지만 API/UI 에 음수 노출되지 않게 0 클램프.
  const spd = Math.max(0, totalStats.spd);
  const extraAttackChancePct = spd * EXTRA_ATK_PCT_PER_SPD;

  // hp 클램프 (저장값이 maxHp 초과 안 되게)
  const savedHp = character.hp ?? maxHp;
  const hp = Math.max(0, Math.min(savedHp, maxHp));

  // 라이브 skillLayout — v2 마법 슬롯 cap 으로 재사용. storyFlagIds 빈 set.
  const layout = skillLayout({
    level,
    hasFlag: () => false,
  });

  // v2 마법 슬롯 정규화 — 학습 가능·중복 제거·슬롯 cap.
  const equippedSpells = normalizeEquippedSpells(
    character.equippedSpells,
    totalStats.int,
    layout.normalSlots,
  );

  const player: PlayerCombat = {
    hp,
    maxHp,
    maxMp,
    intStat: totalStats.int,
    atk,
    def,
    spd,
    evasionPct,
    accuracyPct,
    attackCount: 1,
    extraAttackChancePct,
    critChancePct,
    baselineRegen: baselineRegenFor(maxHp),
    equippedSpells,
  };

  return {
    player,
    totalStats,
    baseAllocatedStats,
    maxHp,
    // 라이브 스킬·룬·feats·affix 시스템 전부 폐기 — 모두 빈 값.
    runeBonus: emptyRuneBonus(),
    characterSkills: [],
    characterFeats: [],
    effectiveSkillNames: [],
    // 인터페이스 의도상 길이 = layout.featSlots. v2 는 특기 폐기라 모두 null.
    effectiveFeatNames: Array.from({ length: layout.featSlots }, () => null),
    effectiveSkillSet: new Set<string>(),
    layout,
    selectedStance: normalizeStance(character.selectedStance),
  };
}
