// v2 전용 PlayerCombat derive — 라이브 derivePlayerCombat 호출 안 함.
//
// PR-5 (6스탯 옵션 재조정): v2 자체 식으로 PlayerCombat 빌드. 라이브 스킬·룬·feats·
// AP·파라곤·affix 시스템 전부 폐기 (v2 결정). 라이브 derive 의 atk 식이
// str+dex/5+luk/5+spd/5 였던 것을 atk=str 로 단순화 — dex/spd/luk 의 atk 보조 제거.
//
// 재조정된 6스탯 axis (PR-5):
//   str → atk 주력 (atk += str)
//   dex → 회피 (evasionPct += dex×0.5). atk 영향 X (PR-6 에서 명중률 axis 도입 예정)
//   vit → maxHp 주력 (vit×5), def 약화 (vit×0.5)
//   spd → 다중공격 확률, 선공권. atk 영향 X
//   luk → 치명 (critChancePct += luk×0.5). 스킬 조건부 X — 항상 작동
//   int → maxMp (int×10). 마법 axis 는 PR-7 에서 확장
//
// 장비 stats:
//   - EquipBonus 부분 (atk/def + 6스탯) → 입력 합산
//   - 추가 파생 (crit/mp/eva/hp) → 결과에 후-가산
//
// DerivedPlayerCombat 인터페이스 호환 — 다운스트림 코드(api routes, V2CharacterScreen
// 등) 가 layout/runeBonus/characterSkills 같은 필드를 기대하므로 빈 값으로 채운다.
//
// v2 마법 슬롯 cap 은 layout.normalSlots 와 공유 — 라이브 skillLayout 수식 재사용.

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import type { DbExecutor } from "@/lib/server/savesKv";
import { baseCharacter, maxHpForLevel } from "@/adventure/character/defaults";
import {
  baselineRegenFor,
  skillLayout,
} from "@/adventure/character/skills";
import { emptyRuneBonus } from "@/adventure/character/runeBonus";
import { normalizeStance, type StanceId } from "@/adventure/character/stance";
import {
  EVASION_PCT_CAP,
  EXTRA_ATTACK_PCT_PER_SPD,
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

// PR-5 다이얼 — sim 캘리브 후 튜닝 가능하게 한 곳에 모음.
const MP_PER_INT = 10;
const HP_PER_VIT = 5; // 라이브의 3 → v2 5 (vit 강화)
const DEF_PER_VIT_NUM = 1; // v2 = vit × (NUM/DEN). 라이브 = vit (1.0). v2 = 0.5
const DEF_PER_VIT_DEN = 2;
const CRIT_PER_LUK_NUM = 1; // luk × (NUM/DEN). v2 = 0.5%
const CRIT_PER_LUK_DEN = 2;

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

  // baseAllocatedStats = base + training.allocated (장비 6스탯 제외)
  const baseAllocatedStats: Record<StatKey, number> = STAT_KEYS.reduce(
    (acc, k) => {
      acc[k] =
        (baseCharacter.stats[k] ?? 0) + (training.allocated?.[k] ?? 0);
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

  // v2 식 — 라이브 atk 식과 핵심 차이: dex/spd/luk 의 /5 보조 제거.
  const atk = totalStats.str + equipAcc.atk;
  const def =
    Math.floor((totalStats.vit * DEF_PER_VIT_NUM) / DEF_PER_VIT_DEN) +
    equipAcc.def;
  const maxHp =
    Math.floor(maxHpForLevel(level) + totalStats.vit * HP_PER_VIT) +
    equipAcc.hp;
  const maxMp = totalStats.int * MP_PER_INT + equipAcc.mp;
  const critChancePct =
    Math.floor((totalStats.luk * CRIT_PER_LUK_NUM) / CRIT_PER_LUK_DEN) +
    equipAcc.crit;
  const evasionPct = Math.min(
    totalStats.dex * 0.5 + equipAcc.eva,
    EVASION_PCT_CAP,
  );
  // spd 가 중갑 페널티로 음수가 될 수 있음. 엔진은 chance<=0 에서 base 공격으로
  // 클램프하지만 API/UI 에 음수 노출되지 않게 0 클램프.
  const spd = Math.max(0, totalStats.spd);
  const extraAttackChancePct = spd * EXTRA_ATTACK_PCT_PER_SPD;

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
