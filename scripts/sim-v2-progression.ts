// v2 진행 시뮬레이션 — 7 archetype × 6 milestone 매트릭스로 derived stats + 던전
// 전체 잡몹 풀 평균 처치턴/승률/패배 진단 측정.
//
// PR-S1 (×5 스케일) 이후 v2 game sim. v2Stats.ts (5pt/lv) + V2_BASE_STATS(15) +
// V2_EQUIPMENT(35종, tier-by-level) + derivePlayerCombatV2Pure 기반.
//
// PR-S3b 개선 (codex 권고):
//   - 첫 잡몹 1종 → 층 전체 풀 평균 (sample bias 제거)
//   - 손실 진단: 패배 시 평균 turns / 적 HP % 남음 (얼마나 가까웠나)
//   - wr% Wilson 95% CI half-width 컬럼 (작은 차이가 노이즈인지 판단)
//
// 향후 sim 확장 후보 (별 스크립트):
//   - 아레나 봇 vs 플레이어 매치 sim
//   - 보스 단독전 sim (보스 풀 별도)
//   - 다층 연속 sim (캐릭이 던전 1층부터 진행하며 누적 보상)
//
// 실행: node --import tsx scripts/sim-v2-progression.ts
//
// 해석 가이드:
//   - wr%   = 풀 평균 승률 (층 모든 잡몹 가중 동일)
//   - winT  = 승리 시 평균 처치 턴 (낮을수록 강함)
//   - lossT = 패배 시 평균 사망 턴 (높을수록 끈질김)
//   - hpL%  = 패배 시 적 HP 평균 잔량 % (0% 완전 처치 직전, 100% 못 깎음)
//   - 빌드 간 격차 = 메타 빌드 지배 신호.

import { resolveBattle, type PlayerCombat } from "../src/adventure/battle/engine";
import {
  setV2BattleModel,
  setBattleRng,
  makeSeededRng,
  setRatioDef,
  setV2HitParams,
  setGearPowerScale,
  setSkillDamageScale,
  setHolyDamageScale,
  setHolyRamp,
  setFlatHit,
} from "../src/adventure/battle/combatShared";
import { pickAutoAction } from "../src/adventure/battle/pickAutoAction";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import { V2_STAT_POINTS_PER_LEVEL } from "../src/adventure/data/v2/v2Stats";
import {
  V2_SKILLS,
  v2SkillSlotsForLevel,
  type V2SkillId,
  type V2SkillsState,
} from "../src/adventure/data/v2/v2Skills";
import {
  V2_CLASS_DEFS,
  nextTierClassOf,
  signaturesForClass,
  type V2Class,
} from "../src/adventure/data/v2/classes";
import {
  emptyProficiency,
  addPoints,
  addCumLevel,
  applyCultivation,
  setGroupTier,
  V2_PROFICIENCY_PER_KILL,
  type V2ProficiencyState,
} from "../src/adventure/data/v2/proficiency";
import {
  computeStatFloors,
  rollLevelGrowth,
} from "../src/adventure/data/v2/statGrowth";
import { requiredExpToNext } from "../src/lib/leveling";
import { derivePowerScore } from "../src/adventure/data/v2/power";
import { V2_ELEMENT_CYCLE, type V2Element } from "../src/adventure/data/v2/elements";
import { MONSTERS } from "../src/adventure/data/monsters";
import { MAIN_DUNGEON } from "../src/adventure/data/v2/dungeon";
import { scaleMonsterForFloor } from "../src/adventure/data/v2/monsterScale";
import type {
  V2EquipmentId,
  V2EquipSlot,
} from "../src/adventure/data/v2/v2Equipment";
import type { V2StatKey } from "../src/adventure/data/v2/v2StatKeys";
import type { Monster } from "../src/adventure/data/monsters/types";

type Arch = "STR" | "DEX" | "VIT" | "INT" | "SPI" | "LUK" | "BAL";
const ARCHES: Arch[] = ["STR", "DEX", "VIT", "INT", "SPI", "LUK", "BAL"];

// SIM-핸드오프 작업5 — 빌드 속성(공격·캐릭). 7-순환을 7빌드에 하나씩 고르게 배정(임의 매핑 —
// 디자이너가 재배정 가능). 몬스터도 풀에서 순환으로 고르게 → 빌드마다 유/불리/중립 매치가 섞임
// (한 빌드가 전 매치 우위인 "필수 가위바위보" 회피). 속성은 §B 모델(--v2model) 평타에서만 작동.
const BUILD_ELEMENT: Record<Arch, V2Element> = {
  STR: "fire",
  DEX: "wind",
  VIT: "earth",
  INT: "starlight",
  SPI: "water",
  LUK: "void",
  BAL: "lightning",
};

type Milestone = { lvl: number; floor: 1 | 2 | 3 | 4 | 5 };
const MILESTONES: Milestone[] = [
  { lvl: 3, floor: 1 },
  { lvl: 10, floor: 2 },
  { lvl: 25, floor: 3 },
  { lvl: 50, floor: 4 },
  { lvl: 75, floor: 5 },
  { lvl: 100, floor: 5 },
];

function tierForLevel(level: number): 1 | 2 | 3 | 4 | 5 {
  if (level < 10) return 1;
  if (level < 25) return 2;
  if (level < 50) return 3;
  if (level < 75) return 4;
  return 5;
}

// 무기: STR/VIT/LUK/BAL = sword (str+atk), DEX/SPD = bow (dex+atk+crit), INT = staff
const WEAPON_LINE: Record<"sword" | "bow" | "staff", Record<1 | 2 | 3 | 4 | 5, V2EquipmentId>> = {
  sword: { 1: "v2_iron_sword", 2: "v2_steel_sword", 3: "v2_greatsword", 4: "v2_silver_sword", 5: "v2_mithril_sword" },
  bow: { 1: "v2_wooden_bow", 2: "v2_recurve_bow", 3: "v2_horn_bow", 4: "v2_silver_bow", 5: "v2_starsong_bow" },
  staff: { 1: "v2_oak_staff", 2: "v2_runed_staff", 3: "v2_obsidian_staff", 4: "v2_silver_staff", 5: "v2_starlit_staff" },
};
const ARMOR_LINE: Record<"heavy" | "light", Record<1 | 2 | 3 | 4 | 5, V2EquipmentId>> = {
  heavy: { 1: "v2_chain_mail", 2: "v2_plate_armor", 3: "v2_full_plate", 4: "v2_silver_plate", 5: "v2_mithril_plate" },
  light: { 1: "v2_leather_armor", 2: "v2_studded_leather", 3: "v2_shadow_cloak", 4: "v2_silken_armor", 5: "v2_windweave_cloak" },
};
const GLOVES_LINE: Record<"heavy" | "light", Record<1 | 2 | 3 | 4 | 5, V2EquipmentId>> = {
  heavy: { 1: "v2_iron_gauntlets", 2: "v2_steel_gauntlets", 3: "v2_plate_gauntlets", 4: "v2_silver_gauntlets", 5: "v2_mithril_gauntlets" },
  light: { 1: "v2_leather_gloves", 2: "v2_studded_gloves", 3: "v2_shadow_gloves", 4: "v2_silken_gloves", 5: "v2_windweave_gloves" },
};
const BOOTS_LINE: Record<"heavy" | "light", Record<1 | 2 | 3 | 4 | 5, V2EquipmentId>> = {
  heavy: { 1: "v2_iron_boots", 2: "v2_steel_boots", 3: "v2_plate_boots", 4: "v2_silver_boots", 5: "v2_mithril_boots" },
  light: { 1: "v2_leather_boots", 2: "v2_studded_boots", 3: "v2_shadow_boots", 4: "v2_silken_boots", 5: "v2_windweave_boots" },
};
// 반지(운)·목걸이(마법) — 6슬롯 전환 후 둘 다 착용(옛 ACC_LINE 분할).
const RING_LINE: Record<1 | 2 | 3 | 4 | 5, V2EquipmentId> = { 1: "v2_silver_ring", 2: "v2_gold_ring", 3: "v2_lucky_charm", 4: "v2_stardust_ring", 5: "v2_fate_ring" };
const NECKLACE_LINE: Record<1 | 2 | 3 | 4 | 5, V2EquipmentId> = { 1: "v2_jade_amulet", 2: "v2_rune_pendant", 3: "v2_crystal_amulet", 4: "v2_starlight_pendant", 5: "v2_mana_essence" };

function equipFor(arch: Arch, level: number): Partial<Record<V2EquipSlot, V2EquipmentId>> {
  const tier = tierForLevel(level);
  const weapon =
    arch === "DEX"
      ? WEAPON_LINE.bow[tier]
      : arch === "INT"
        ? WEAPON_LINE.staff[tier]
        : WEAPON_LINE.sword[tier];
  // VIT 와 STR 은 중갑 (vit+def, spd 페널티 감수). 나머지는 경갑. 장갑·신발은 갑옷 결을 따른다.
  const weight: "heavy" | "light" =
    arch === "STR" || arch === "VIT" || arch === "LUK" ? "heavy" : "light";
  const armor = ARMOR_LINE[weight][tier];
  const gloves = GLOVES_LINE[weight][tier];
  const boots = BOOTS_LINE[weight][tier];
  const ring = RING_LINE[tier];
  const necklace = NECKLACE_LINE[tier];
  return { weapon, armor, gloves, boots, ring, necklace };
}

// 성장 입력(SIM-핸드오프 작업2·3) — 옛 수동 60/30/10 분배 폐기. 실제 게임의 숙련도 랜덤성장을
// 그대로 사용: 직군 누적레벨→floor(computeStatFloors), 수행(cultivation)→cap, 레벨업마다
// rollLevelGrowth(앵커 3:1)로 grown 누적. 직업 프로필(앵커+관련2)은 V2_CULTIVATE_PROFILE(floor)
// + rollLevelGrowth 앵커 가중에서 자동 반영 → 임의 sub/fill 폐기(작업3). 성장 rng 는 (arch,level)
// 고정 시드라 매트릭스가 실행마다 재현(전투 --seed 와 독립).
const GROWTH_MONSTER_EXP = 350; // 킬→포인트 환산 가정(sim-v2-proficiency 와 동일). cap 연료용.

function cultivateToEmpty(
  prof: V2ProficiencyState,
  group: string,
  rng: () => number,
): V2ProficiencyState {
  let cur = prof;
  for (let i = 0; i < 1000; i++) {
    const r = applyCultivation(cur, group, rng);
    if (!r) break;
    cur = r.next;
  }
  return cur;
}

type GrowthResult = {
  floors: Record<V2StatKey, number>;
  caps: Partial<Record<V2StatKey, number>>;
  grown: Partial<Record<V2StatKey, number>>;
};

// arch+level → 숙련도 floor/cap + 랜덤성장 grown. 단일 직군 커리어를 monotonic level 로 근사
// (cumLevel=level). 도달 차수는 classForArchLevel 로 산정해 floor tierMult 반영(스냅샷 근사).
function growForArchLevel(arch: Arch, level: number, variant = 0): GrowthResult {
  const group = ARCH_CLASS_T1[arch];
  const cls = classForArchLevel(arch, level);
  const rng = makeSeededRng(`growth:${arch}:${level}:${variant}`);
  let prof = emptyProficiency();
  let grown: Partial<Record<V2StatKey, number>> = {};
  // BAL(무직) — 적립·수행·floor 없음. 균등 랜덤성장(headroom 내).
  if (group === "none") {
    for (let lv = 1; lv < level; lv++) {
      grown = rollLevelGrowth(grown, "none", prof, rng);
    }
    return { floors: computeStatFloors(prof), caps: prof.caps, grown };
  }
  prof = setGroupTier(prof, group, V2_CLASS_DEFS[cls].tier);
  for (let lv = 1; lv < level; lv++) {
    const need = requiredExpToNext(lv) ?? 0;
    const kills = need > 0 ? Math.ceil(need / GROWTH_MONSTER_EXP) : 0;
    prof = addPoints(prof, group, kills * V2_PROFICIENCY_PER_KILL);
    prof = addCumLevel(prof, group, 1);
    prof = cultivateToEmpty(prof, group, rng); // 잔여 포인트로 cap 헤드룸 상승.
    grown = rollLevelGrowth(grown, cls, prof, rng); // 앵커 가중 랜덤성장(cap 바운드).
  }
  return { floors: computeStatFloors(prof), caps: prof.caps, grown };
}

// PR-10 — sim 충실도: 아키타입 → 직업군 1차, 레벨로 도달 차수(전직 레벨 게이트)를 산출해
// 앵커 보정(statBonusPct) + 차수별 시그니처가 실제처럼 반영되게. BAL 은 무직(보정 없음).
const ARCH_CLASS_T1: Record<Arch, V2Class> = {
  STR: "swordsman",
  DEX: "archer",
  VIT: "martial",
  INT: "mage",
  SPI: "priest",
  LUK: "ninja",
  BAL: "none",
};

// 직업군 1차에서 레벨이 충족하는 만큼 전직(advanceLevel 게이트)해 도달한 차수 직업 반환.
function classForArchLevel(arch: Arch, level: number): V2Class {
  let c = ARCH_CLASS_T1[arch];
  if (c === "none") return c;
  for (;;) {
    const next = nextTierClassOf(c);
    if (!next) break;
    const reqLvl = V2_CLASS_DEFS[next].advanceLevel ?? Infinity;
    if (level >= reqLvl) c = next;
    else break;
  }
  return c;
}

// --passives: 직업 패시브(시그니처) 반영. 도달 차수까지의 시그니처를 learned 로 줘서
// derive 가 직업 패시브(추가타/받피감/마공/턴회복/명중·DoT/크리뎀)를 켠다. 기본 off =
// 패시브 없는 baseline(기존 다이얼 비교용). BAL(무직)은 시그니처 없어 패시브 없음.
const PASSIVES_MODE = process.argv.includes("--passives");

// 결정된 전투 모델(2026-06 캘리브): §B(평타 천장×floorPct~천장 uniform roll + 속성 상성) +
// 비율경감 def(아래 C=100)를 **기본 ON**. --legacy 면 옛 빼기 모델(§B·비율 끔)로 되돌려 비교.
// (라이브 엔진 기본값은 별개 — setV2BattleModel 기본 OFF 유지, 라이브 채택은 테스트 마이그 후.)
const LEGACY = process.argv.includes("--legacy");
const V2_MODEL_MODE = !LEGACY;
setV2BattleModel(V2_MODEL_MODE);

// SIM-핸드오프 — 시드 재현. --seed=<문자열> 주면 전투마다 결정론 PRNG 로 재시드 →
// "같은 시드 = 같은 전투" → 다이얼/공식 변경 전후를 동일 전투 기준으로 비교(noise 제거).
// 미지정이면 Math.random(기존 동작). 재시드는 (셀×몹×trial) 단위(combatStats)에서 한다.
const SEED_ARG = process.argv.find((a) => a.startsWith("--seed="));
const SEED: string | null = SEED_ARG ? SEED_ARG.slice("--seed=".length) : null;

// 작업5 — 속성 부여 끄기(A/B용). 켜면 빌드·몹 전부 neutral(상성 무효). 기본 = 속성 부여.
const NEUTRAL_ELEM = process.argv.includes("--neutral-elem");

// 작업6 — 몬스터 미러. 켜면 사냥터 풀 = 동레벨 유저 미러(4잡몹+보스1). 기본 = authored 몹.
const MIRROR_MODE = process.argv.includes("--mirror");

// 작업1 A측정 — 플레이어 장비 제거(몹/미러는 장비 유지). 전후 WR·파워 델타 = 장비 양적 기여(목표 ~60%).
const NOEQUIP = process.argv.includes("--noequip");

// 작업1 A상향 — 장비 위력 스케일. **결정: 기본 2.25**(장비 양적 비중 ~45%, 40~50% 타겟).
// --gearscale=<배율> override, --legacy 면 1.0(옛). (라이브 채택은 별개 — V2_EQUIPMENT 위력 반영 or scale.)
const GEARSCALE_ARG = process.argv.find((a) => a.startsWith("--gearscale="));
const GEAR_SCALE = LEGACY
  ? 1
  : GEARSCALE_ARG
    ? Number(GEARSCALE_ARG.split("=")[1]) || 2.25
    : 2.25;
setGearPowerScale(GEAR_SCALE);

// 스킬 데미지 스케일 — **결정: 기본 0.5**(스킬 버스트 완화 → 빌드 winT 균질화, 코어 6~16t).
// --skillscale=<배율> override, --legacy=1.0(옛 버스트).
const SKILLSCALE_ARG = process.argv.find((a) => a.startsWith("--skillscale="));
const SKILL_SCALE = LEGACY
  ? 1
  : SKILLSCALE_ARG
    ? Number(SKILLSCALE_ARG.split("=")[1]) || 0.5
    : 0.5;
setSkillDamageScale(SKILL_SCALE);

// 사제 홀리딜 스케일(--holyscale=<배율>, 기본 1). SPI winT 를 다른 빌드와 맞추는 다이얼.
const HOLYSCALE_ARG = process.argv.find((a) => a.startsWith("--holyscale="));
const HOLY_SCALE = HOLYSCALE_ARG ? Number(HOLYSCALE_ARG.split("=")[1]) || 1 : 1;
setHolyDamageScale(HOLY_SCALE);

// 사제 홀리딜 누적 — **결정: 기본 0.3**(딜만 누적, 힐 고정). 홀리 = base×(1+완료턴×ramp). 버틸수록 강함.
// --holyramp=<r> override, --legacy=0. (라이브 채택은 패시브에 baked 후속.)
const HOLYRAMP_ARG = process.argv.find((a) => a.startsWith("--holyramp="));
const HOLY_RAMP = LEGACY
  ? 0
  : HOLYRAMP_ARG
    ? Number(HOLYRAMP_ARG.split("=")[1]) || 0.3
    : 0.3;
setHolyRamp(HOLY_RAMP);

// 비율경감 def 모델 — --ratiodef 또는 --ratiodef=<C>. 천장 = atk×C/(C+def)(빼기 대신). 기본 C=100.
// §B 모델(--v2model) 평타에서만 효과. 약공 벽·PvP 뚫림(빼기 절벽) 완화 측정용.
const RATIODEF_ARG = process.argv.find((a) => a.startsWith("--ratiodef"));
const RATIODEF_C: number | null = LEGACY
  ? null
  : RATIODEF_ARG
    ? Number(RATIODEF_ARG.split("=")[1] ?? "100") || 100
    : 100; // 결정 모델 기본 C=100. --ratiodef=<C> 로 override, --legacy 로 끔.
setRatioDef(RATIODEF_C);

// 명중 비율식 다이얼(§D 시드 k=1, C=0). --hitk=<k> --hitc=<C>. §B 모델 평타에서만 사용.
const HITK_ARG = process.argv.find((a) => a.startsWith("--hitk="));
const HITC_ARG = process.argv.find((a) => a.startsWith("--hitc="));
const HIT_K = HITK_ARG ? Number(HITK_ARG.split("=")[1]) || 1 : 1;
const HIT_C = HITC_ARG ? Number(HITC_ARG.split("=")[1]) || 0 : 0;
setV2HitParams(HIT_K, HIT_C);

// flat-base 명중 모델(디자이너 제안) — --flathit[=base] 로 켬. hit% = clamp(floor, base − eva×k, base).
// 명중 축 은퇴(회피만 base 차감). --flatfloor=<n> 으로 적중 하한(PvP 회피불사 방지). 기본 base=95, floor=0.
const FLATHIT_ARG = process.argv.find((a) => a.startsWith("--flathit"));
const FLATFLOOR_ARG = process.argv.find((a) => a.startsWith("--flatfloor="));
const FLAT_BASE: number | null = FLATHIT_ARG
  ? Number(FLATHIT_ARG.split("=")[1] ?? "95") || 95
  : null;
const FLAT_FLOOR = FLATFLOOR_ARG ? Number(FLATFLOOR_ARG.split("=")[1]) || 0 : 0;
setFlatHit(FLAT_BASE, FLAT_FLOOR);
if (FLAT_BASE !== null) {
  console.log(
    `flat-base 명중 ON (--flathit, base=${FLAT_BASE}, floor=${FLAT_FLOOR}, eva×k=${HIT_K}): hit%=clamp(floor, base − eva×k, base). 명중 축 은퇴.`,
  );
}

function makePlayer(arch: Arch, level: number) {
  // PR-10 — playerClass 전달로 앵커 보정 반영(차수는 레벨로 결정).
  const cls = classForArchLevel(arch, level);
  // SIM-핸드오프 작업2 — 숙련도 랜덤성장(floor/cap/앵커) 입력. 옛 allocate() 수동분배 대체.
  // floor/cap 을 derive 에 같이 넘겨 stat = floor+grown 이 유효 cap 으로 클램프되게(실 게임 경로 동일).
  const { floors, caps, grown } = growForArchLevel(arch, level);
  const d = derivePlayerCombatV2Pure({
    level,
    allocatedStats: grown,
    statFloors: floors,
    statCaps: caps,
    v2Equipped: NOEQUIP ? {} : equipFor(arch, level),
    playerClass: cls,
    learnedSkillIds: PASSIVES_MODE ? signaturesForClass(cls) : undefined,
    hp: undefined,
  });
  // 작업5 — 평타/캐릭 속성 부여(§B 모델 평타가 elementMult 에 사용). neutral 모드면 미부여.
  if (!NEUTRAL_ELEM) {
    const el = BUILD_ELEMENT[arch];
    d.player.attackElement = el;
    d.player.characterElement = el;
  }
  return d;
}

// --skills: 각 빌드가 주력 스탯 스킬을 장착하고 싸우는 모드. INT 마법 경로(magicAtk) 캘리브용.
// 기본(off)은 일반 공격 baseline 유지 — 기존 ATK_PER_* 다이얼은 이 baseline 으로 튜닝됨.
const SKILLS_MODE = process.argv.includes("--skills");

// 빌드의 주력 스탯 스킬 로드아웃. 학습 조건(level + stat min)을 충족하는 것만, 슬롯 수 cap.
// 우선순위: 공격 스킬(고티어=고배율 먼저) → 버프/디버프. 자동발동은 슬롯 순서 우선.
function skillsFor(
  arch: Arch,
  level: number,
  totalStats: Record<V2StatKey, number>,
): V2SkillsState {
  if (!SKILLS_MODE) return { learned: [], equipped: [] };
  const mainStat: V2StatKey = arch === "BAL" ? "str" : (arch.toLowerCase() as V2StatKey);
  // PR-10 — 시그니처(requireClass)는 도달한 차수까지만 보유(레벨로 전직 차수 결정).
  const cls = classForArchLevel(arch, level);
  const curTier = V2_CLASS_DEFS[cls].tier;
  const curGroup = V2_CLASS_DEFS[cls].group;
  const ids = (Object.keys(V2_SKILLS) as V2SkillId[]).filter((id) => {
    const def = V2_SKILLS[id];
    if (def.monsterOnly) return false;
    const rc = def.learn?.requireClass;
    if (rc) {
      // 직업 시그니처 — 직업군 + 도달한 차수(tier ≤ 현 차수)로만 판정. def.stat 무관:
      // 신관 힐 시그니처는 stat="int"(라이브 StatKey 에 spi 없음)이지만 신술(spi) 직업 것이라
      // mainStat 필터로 거르면 SPI 가 힐조차 못 껴 0% 과장됨(Codex). BAL(무직)은 시그니처 없음.
      const rd = V2_CLASS_DEFS[rc];
      return rd.group === curGroup && rd.tier <= curTier;
    }
    // 비-시그니처 학습 스킬 — 주력 스탯 일치 + 레벨/스탯 게이트.
    if (def.stat !== mainStat) return false;
    if (!def.learn) return true; // 스타터 = 항상 보유
    if (level < (def.learn.level ?? 0)) return false;
    const req = def.learn.stat;
    if (req && ((totalStats as Record<string, number>)[req.key] ?? 0) < req.min) return false;
    return true;
  });
  // 공격 먼저(티어 desc → 고배율 우선), 그 다음 버프/디버프(티어 desc).
  const ordered = ids.sort((a, b) => {
    const da = V2_SKILLS[a];
    const db = V2_SKILLS[b];
    const atkA = da.category === "attack" ? 1 : 0;
    const atkB = db.category === "attack" ? 1 : 0;
    if (atkA !== atkB) return atkB - atkA;
    return db.tier - da.tier;
  });
  const equipped = ordered.slice(0, v2SkillSlotsForLevel(level));
  return { learned: ids, equipped };
}

// 층 전체 풀 — 잡몹 이름→scaled Monster. 미정의 이름은 스킵.
function floorMonsters(floor: 1 | 2 | 3 | 4 | 5): Monster[] {
  const f = MAIN_DUNGEON.floors.find((x) => x.id === floor);
  if (!f) return [];
  const out: Monster[] = [];
  let idx = 0;
  for (const e of f.enemies) {
    const base = MONSTERS[e.key];
    if (!base) continue;
    const scaled = scaleMonsterForFloor(base, floor);
    // 작업5 — 몬스터 속성: 풀에서 7-순환 고르게 배정(빌드마다 유/불리/중립 섞이게). neutral 모드면 미부여.
    out.push(
      NEUTRAL_ELEM
        ? scaled
        : { ...scaled, element: V2_ELEMENT_CYCLE[idx % V2_ELEMENT_CYCLE.length] },
    );
    idx += 1;
  }
  return out;
}

// SIM-핸드오프 작업6 — 몬스터 미러. 동레벨 유저(makePlayer)를 derive 해 Monster 로 변환
// (성장·속성·치명저항·바닥비율 그대로). 잡몹은 물리 위주 4직업(속성 고르게)·패시브 미보유
// (Monster 변환이 패시브 효과 필드를 안 옮김 = baseline). 보스 = 탱키(VIT) 미러 ×1.5 스탯.
// 미러의 본 가치 = 테스트 공정성(authored 몹·floor5 절벽 땜질 대신 동레벨 유저급 적).
function mirrorMonster(
  arch: Arch,
  level: number,
  boss: boolean,
  variant: number,
): Monster {
  // 미러 전용 derive — 변주 시드 + 패시브 없음(잡몹 baseline). makePlayer 와 분리.
  const cls = classForArchLevel(arch, level);
  const { floors, caps, grown } = growForArchLevel(arch, level, variant);
  const p = derivePlayerCombatV2Pure({
    level,
    allocatedStats: grown,
    statFloors: floors,
    statCaps: caps,
    v2Equipped: equipFor(arch, level),
    playerClass: cls,
  }).player;
  const mult = boss ? 1.5 : 1;
  return {
    name: `${boss ? "미러보스" : "미러"}-${arch}${variant}`,
    tags: ["humanoid"],
    hp: Math.max(1, Math.round(p.maxHp * mult)),
    atk: Math.max(1, Math.round(p.atk * mult)),
    def: Math.max(0, Math.round(p.def * mult)),
    spd: p.spd,
    evasionPct: p.evasionPct,
    accuracy: p.accuracyPct, // 유저 명중 → 플레이어 회피 차감(대칭)
    element: NEUTRAL_ELEM ? "neutral" : BUILD_ELEMENT[arch],
    critResistPct: p.critResistPct, // 정신 비례 — 플레이어 크리 경감
    damageFloorPct: p.damageFloorPct, // §B variance 대칭
    exp: 0,
  };
}

// 미러 풀 — 6직업 × 3변주(stat 변동) 잡몹 18 + 보스 2(탱키 VIT·딜러 STR) = 20종.
// 풀 20종 → WR 5% 단위 해상도(옛 5종=20% 단위 대비 정밀). 직업·속성 분포 고르게.
const MIRROR_ARCHES_ALL: Arch[] = ["STR", "DEX", "VIT", "INT", "SPI", "LUK"];
const MIRROR_VARIANTS = 3;
function mirrorPool(level: number): Monster[] {
  const out: Monster[] = [];
  for (const a of MIRROR_ARCHES_ALL) {
    for (let v = 0; v < MIRROR_VARIANTS; v++) {
      out.push(mirrorMonster(a, level, false, v));
    }
  }
  out.push(mirrorMonster("VIT", level, true, 0));
  out.push(mirrorMonster("STR", level, true, 1));
  return out;
}

// 잡몹 1종당 trial 수. 풀 크기 ~10~20 → 총 ~300~600 sim/cell. 옛 100 단일 잡몹 대비 ~3~6x.
const TRIALS_PER_MONSTER = 30;

type CombatStats = {
  wrPct: number; // 풀 평균 승률 %
  wrCiPct: number; // wr Wilson 95% CI half-width % (작을수록 안정)
  winTurns: number; // 승리 시 평균 turn (0 = 승 X)
  lossTurns: number; // 패배 시 평균 turn (0 = 패 X)
  lossEnemyHpPct: number; // 패배 시 적 HP 평균 잔량 % (0 = 완전 처치 직전, 100 = 못 깎음)
};

// Wilson score interval half-width (95% CI). p = wins/n, n = total trials.
// 큰 표본/극단 비율에서 normal-approx 보다 안전.
function wilsonCiHalfWidth(wins: number, total: number): number {
  if (total === 0) return 0;
  const z = 1.96;
  const p = wins / total;
  const denom = 1 + (z * z) / total;
  const margin = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  // CI = [(center - margin)/denom, (center + margin)/denom]. half-width 는 margin/denom.
  return (margin / denom) * 100;
}

function combatStats(
  player: PlayerCombat,
  enemies: Monster[],
  v2Skills: V2SkillsState,
): CombatStats {
  if (enemies.length === 0) {
    return { wrPct: 0, wrCiPct: 0, winTurns: 0, lossTurns: 0, lossEnemyHpPct: 0 };
  }
  let wins = 0;
  let losses = 0;
  let winTurnsSum = 0;
  let lossTurnsSum = 0;
  let lossHpPctSum = 0;
  for (const enemy of enemies) {
    for (let i = 0; i < TRIALS_PER_MONSTER; i++) {
      // 시드 모드: 이 (몹×trial) 전투를 결정론으로 재현. 전후 비교 시 같은 전투 기준.
      if (SEED !== null) setBattleRng(makeSeededRng(`${SEED}:${enemy.name}:${i}`));
      const r = resolveBattle({ ...player, hp: player.maxHp }, enemy, "Sim", {
        pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
        potions: {},
        v2Skills,
      });
      if (r.outcome === "win") {
        wins++;
        winTurnsSum += r.turns;
      } else {
        losses++;
        lossTurnsSum += r.turns;
        // 적 HP 잔량 % — finalState.enemyHp / enemy.hp.
        const hpPct = (r.finalState.enemyHp / enemy.hp) * 100;
        lossHpPctSum += hpPct;
      }
    }
  }
  const total = wins + losses;
  return {
    wrPct: Math.round((wins / total) * 100),
    wrCiPct: wilsonCiHalfWidth(wins, total),
    winTurns: wins > 0 ? winTurnsSum / wins : 0,
    lossTurns: losses > 0 ? lossTurnsSum / losses : 0,
    lossEnemyHpPct: losses > 0 ? lossHpPctSum / losses : 0,
  };
}

// ── 실행 ────────────────────────────────────────────────────
console.log("v2 진행 시뮬레이션 — 7 archetype × 6 milestone (×5 스케일, 풀 평균)");
console.log(
  `가정: 레벨당 성장 ${V2_STAT_POINTS_PER_LEVEL}pt, 숙련도 랜덤성장(floor/cap·직업 앵커 가중, 작업2·3), tier-by-level 장비, 층 전체 잡몹 × ${TRIALS_PER_MONSTER} trial 풀 평균.`,
);
console.log(
  SKILLS_MODE
    ? "스킬 모드 ON (--skills): 각 빌드가 주력 스탯 스킬 장착(INT=마법 경로 magicAtk 측정)."
    : "스킬 모드 OFF: 일반 공격 baseline. INT 마법 측정하려면 --skills.",
);
console.log(
  PASSIVES_MODE
    ? "패시브 모드 ON (--passives): 도달 차수 직업 패시브 반영(BAL 제외)."
    : "패시브 모드 OFF: 직업 패시브 없음 baseline. 패시브 측정하려면 --passives.",
);
console.log(
  V2_MODEL_MODE
    ? "전투 모델: 결정 모델 ON (§B 평타 + 비율경감). 옛 빼기 비교는 --legacy."
    : "전투 모델: LEGACY (--legacy) — 옛 결정론 빼기 평타(damageBetween).",
);
console.log(
  SEED !== null
    ? `시드 ON (--seed=${SEED}): 전투마다 재현. 같은 시드 재실행 = 동일 결과(전후 비교용).`
    : "시드 OFF: Math.random(매 실행 변동). 재현·전후비교 하려면 --seed=<문자열>.",
);
console.log(
  NEUTRAL_ELEM
    ? "속성 OFF (--neutral-elem): 전부 neutral(상성 무효)."
    : "속성 ON (작업5): 빌드=고정 속성·몹=풀 순환 배정. §B 모델(--v2model)서만 상성 작동.",
);
console.log(
  MIRROR_MODE
    ? "미러 ON (--mirror, 작업6): 사냥터 풀=동레벨 유저 미러(잡몹4직업+보스1·×1.5). authored 몹 대체."
    : "미러 OFF: authored 몹 × 층배율. 동레벨 유저 미러로 보려면 --mirror.",
);
console.log(
  RATIODEF_C !== null
    ? `비율경감 ON (--ratiodef, C=${RATIODEF_C}): 천장=atk×C/(C+def). def 절벽 제거. §B 평타만.`
    : "비율경감 OFF: 천장=atk−def(빼기). 비율 모델 보려면 --ratiodef[=C].",
);
console.log(
  V2_MODEL_MODE
    ? `명중 비율식 ON (k=${HIT_K}, C=${HIT_C}): hit%=(acc+C)/(acc+eva·k+C). --hitc= 로 명중 바닥 조정.`
    : "명중: LEGACY %p 차감.",
);
console.log(
  `장비 위력 스케일 ×${GEAR_SCALE} (장비 양적 비중 캘리브, 기본 2.25≈45%). --gearscale= override.`,
);

const pad = (s: string | number, w: number) => String(s).padStart(w);
const pct = (n: number) => n.toFixed(1).padStart(5);

// "<1" 같은 가독성 셀 만들기 — 0 이면 dash.
function turnCell(t: number, hasAny: boolean): string {
  if (!hasAny) return "  -";
  if (t < 1) return " <1";
  return t.toFixed(1);
}

for (const ms of MILESTONES) {
  const floorMeta = MAIN_DUNGEON.floors.find((f) => f.id === ms.floor);
  const enemies = MIRROR_MODE ? mirrorPool(ms.lvl) : floorMonsters(ms.floor);
  console.log(
    `\n━━━ Lv${ms.lvl} · ${floorMeta?.name ?? `Floor ${ms.floor}`} (pool: ${enemies.length}종) ━━━`,
  );
  console.log(
    "Arch  STR DEX VIT INT SPI LUK │ atk def maxHp maxMp crit% eva% acc% extra% │  wr   ±95 winT lossT hpL% │  pw",
  );
  for (const arch of ARCHES) {
    const d = makePlayer(arch, ms.lvl);
    const s = d.totalStats;
    const p = d.player;
    let combatCol = "│   -    -    -    -    -";
    if (enemies.length > 0) {
      const r = combatStats(p, enemies, skillsFor(arch, ms.lvl, s));
      const wrStr = `${r.wrPct}%`;
      const ciStr = `±${r.wrCiPct.toFixed(1)}`;
      const winT = turnCell(r.winTurns, r.wrPct > 0);
      const lossT = turnCell(r.lossTurns, r.wrPct < 100);
      const hpL = r.wrPct < 100 ? r.lossEnemyHpPct.toFixed(0) + "%" : " -";
      combatCol = `│ ${pad(wrStr, 4)} ${pad(ciStr, 5)} ${pad(winT, 5)} ${pad(lossT, 5)} ${pad(hpL, 4)}`;
    }
    const pw = derivePowerScore({
      atk: p.atk,
      magicAtk: p.magicAtk ?? 0,
      def: p.def,
      magicDef: p.magicDef ?? 0,
      spd: p.spd,
      maxHp: p.maxHp,
      maxMp: p.maxMp ?? 0,
      critResistPct: p.critResistPct ?? 0,
    });
    console.log(
      `${arch.padEnd(5)} ${pad(s.str, 3)} ${pad(s.dex, 3)} ${pad(s.vit, 3)} ${pad(s.int, 3)} ${pad(s.spi, 3)} ${pad(s.luk, 3)} │ ${pad(p.atk, 3)} ${pad(p.def, 3)} ${pad(p.maxHp, 5)} ${pad(p.maxMp ?? 0, 5)} ${pct(p.critChancePct ?? 0)} ${pct(p.evasionPct ?? 0)} ${pct(p.accuracyPct ?? 0)} ${pct(p.extraAttackChancePct ?? 0)} ${combatCol} │ ${pad(pw, 4)}`,
    );
  }
}

console.log(
  "\n해석:\n  - wr%   : 풀 평균 승률.\n  - ±95   : Wilson 95% CI half-width %. 작을수록 안정. 두 빌드 wr 차이가 (±95 합) 보다 작으면 노이즈.\n  - winT  : 승리 시 평균 처치 턴 (낮을수록 강함).\n  - lossT : 패배 시 평균 사망 턴 (높을수록 끈질김 — '거의 깰 뻔' 신호).\n  - hpL%  : 패배 시 적 HP 평균 잔량 % (낮을수록 '간발 패배', 높으면 못 깎고 패배).\n  - hpL% 30% 미만 + wr 낮음 = 데미지 살짝만 올리면 회복 가능한 약점.\n  - hpL% 70%+ + wr 낮음 = 빌드 자체가 그 층 못 깸 (구조적 부족).",
);
