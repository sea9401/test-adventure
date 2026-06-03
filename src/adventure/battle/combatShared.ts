// 두 전투 엔진(engine.ts = PvE, engine-pvp.ts = PvP)이 공유하는 순수 헬퍼.
//
// 두 엔진은 데이터 모델이 다르다 — PvE 는 비대칭(player vs enemy), PvP 는 대칭(side vs side).
// 그래서 턴 상태머신·데미지 계산은 각자 갖되, 모델과 무관한 순수 계산은 여기 한 곳에 둔다.
// 한쪽만 고쳐 둘이 어긋나는 divergence(예: 추가공격 롤이 PvP 에서만 +1 로 막혀 있던 버그)를 막기 위함.
//
// PlayerCombat 은 engine.ts 에서 정의 — type-only import 라 런타임 순환참조 없음(타입은 소거).

import { computeHealAmount, type Potion } from "../data/potions";
import type { APSkill, APSkillEffect } from "../character/apSkills";
import {
  V2_SKILLS,
  type V2SkillDefinition,
  type V2SkillId,
  type V2SkillsState,
} from "../data/v2/v2Skills";
import { V2_CLASS_DEFS } from "../data/v2/classes";
import { elementDamageMult, type V2Element } from "../data/v2/elements";
import type { StatKey } from "../data/stats";
import type { EquippedAPSkill, PlayerCombat } from "./engine";

export const AP_SKILLS_PER_TURN_CAP = 3;

// ── 전투 RNG 주입 (SIM-핸드오프 / 시드 재현) ────────────────────────────────
// 두 엔진(PvE/PvP)과 모든 확률 굴림이 Math.random 대신 battleRandom() 을 쓴다. 기본은
// Math.random 을 **매 호출 동적으로** 부르므로(참조 캡처 X) 테스트의 vi.spyOn(Math,"random")
// 모킹이 그대로 먹힌다(기존 2698 테스트 불변). 시뮬은 setBattleRng(makeSeededRng(seed)) 로
// 결정론 PRNG 를 주입해 "같은 시드 = 같은 전투" 재현 → 다이얼 전후 비교가 동일 전투 기준이 됨.
let injectedBattleRng: (() => number) | null = null;

/** 결정론 RNG 주입. null 이면 Math.random 으로 복귀(라이브·테스트 기본). */
export function setBattleRng(fn: (() => number) | null): void {
  injectedBattleRng = fn;
}

/** 전투 확률 굴림의 단일 소스. 주입 PRNG 있으면 그걸, 없으면 Math.random(동적 호출). */
export function battleRandom(): number {
  return injectedBattleRng ? injectedBattleRng() : Math.random();
}

/** 문자열 시드 → 결정론 PRNG(mulberry32 + 문자열 해시). 같은 시드 = 같은 난수열. */
export function makeSeededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function seededRandom(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type ApSkillSelectionState = {
  canFireApSkill: (equipped: EquippedAPSkill) => boolean;
};

export function isOffensiveApEffect(effect: APSkillEffect): boolean {
  return (
    effect.kind === "atk_multiplier" ||
    effect.kind === "multi_hit_self_damage" ||
    effect.kind === "atk_multiplier_with_silence" ||
    effect.kind === "atk_plus_spd_pct_bonus"
  );
}

export function selectApSkillsToFire(
  equipped: ReadonlyArray<EquippedAPSkill>,
  state: ApSkillSelectionState,
  budgetAp: number,
): { offensive: EquippedAPSkill | null; utilities: EquippedAPSkill[]; totalCost: number } {
  let remainingAp = budgetAp;
  let offensive: EquippedAPSkill | null = null;
  const utilities: EquippedAPSkill[] = [];
  let count = 0;

  for (const e of equipped) {
    if (count >= AP_SKILLS_PER_TURN_CAP) break;
    const skill: APSkill = e.skill;
    if (skill.apCost > remainingAp) continue;
    if (!state.canFireApSkill(e)) continue;

    const isOffensive = isOffensiveApEffect(skill.effect);
    if (isOffensive && offensive) continue;

    if (isOffensive) offensive = e;
    else utilities.push(e);
    remainingAp -= skill.apCost;
    count += 1;
  }

  return { offensive, utilities, totalCost: budgetAp - remainingAp };
}

// AP 스킬 effect → 공격 배수/방어무시/회피무시/타격수. atk_multiplier 계열(광살참
// multi_hit_self_damage·천뢰 일격 atk_multiplier_with_silence 포함)이 atkMult/ignoresDef/
// ignoresEvasion 를 공유한다. 두 엔진(PvE/PvP)이 토씨까지 같던 블록을 한 곳으로 — 한쪽만
// 고쳐 어긋나는 divergence 방지. 동작은 옛 인라인 조건과 동일.
export function extractApEffect(effect: APSkillEffect | undefined): {
  atkMult: number;
  ignoresDef: boolean;
  ignoresEvasion: boolean;
  hits: number;
} {
  if (
    effect?.kind === "atk_multiplier" ||
    effect?.kind === "multi_hit_self_damage" ||
    effect?.kind === "atk_multiplier_with_silence"
  ) {
    return {
      atkMult: effect.atkMult,
      ignoresDef: effect.ignoresDef === true,
      ignoresEvasion: effect.ignoresEvasion === true,
      hits: effect.kind === "multi_hit_self_damage" ? effect.hits : 1,
    };
  }
  return { atkMult: 1, ignoresDef: false, ignoresEvasion: false, hits: 1 };
}

// 공격 횟수 롤 — base(attackCount) + 추가타. 추가공격 확률은 100% 초과 가능:
// 정수부는 보장 추가타, 나머지(%)는 확률. (예: 150% → +1 보장 + 50% 확률로 +1 더.)
export function rollAttackCount(player: PlayerCombat): number {
  const base = Math.max(1, player.attackCount);
  const luckBonus = player.universalLuckBonusPct ?? 0;
  const chance = (player.extraAttackChancePct ?? 0) + luckBonus;
  if (chance <= 0) return base;
  const guaranteed = Math.floor(chance / 100);
  const remainder = chance - guaranteed * 100;
  const extra = guaranteed + (battleRandom() * 100 < remainder ? 1 : 0);
  return base + extra;
}

// ── §B 통합 전투 모델 (SIM-핸드오프) ───────────────────────────────────────
// 평타 데미지를 §B 모델로 계산하는 공유 헬퍼 (PvE/PvP/시뮬 공유 — divergence 방지).
//   천장 = max(1, atk − def)
//   바닥 = 천장 × floorPct (floorPct 캡 V2_DAMAGE_FLOOR_PCT_CAP = 0.9)
//   variance ON → uniform(바닥, 천장) · OFF → 천장(결정론)
//   × elementMult (§B 속성 상성, 미지정 = 1)
//   정수 내림, 최소 1
//
// 플래그(setV2BattleModel)는 **기본 OFF** — 그때 엔진은 이 함수 대신 기존 damageBetween 을
// 써 동작이 불변(기존 테스트 전부 그린). 시뮬이 setV2BattleModel(true) 로 켜 §B 를 측정·
// 캘리브한다. 평타 속성 상성도 플래그 ON 일 때만 엔진이 직접 적용 — 라이브 hunt 는 속성을
// atk 에 baked 하므로(이중적용 방지) OFF 유지. 라이브 채택은 후속(평타 결정성 테스트 마이그 후).
export const V2_DAMAGE_FLOOR_PCT_CAP = 0.9;

let v2BattleModelEnabled = false;
export function setV2BattleModel(enabled: boolean): void {
  v2BattleModelEnabled = enabled;
}
export function isV2BattleModelEnabled(): boolean {
  return v2BattleModelEnabled;
}

// 비율경감(ratio mitigation) 모델 — 천장을 빼기(atk−def) 대신 비율(atk×C/(C+def))로.
// def 가 절대 0(약공 벽)도, 절대 무력화(PvP 뚫림)도 안 됨 — 빼기 모델의 "절벽" 제거.
// C = def 강도 다이얼(낮을수록 def 강함). null = 끔(기존 빼기). §B 모델 평타에서만 효과.
let ratioDefC: number | null = null;
export function setRatioDef(c: number | null): void {
  ratioDefC = c != null && c > 0 ? c : null;
}
export function isRatioDefEnabled(): boolean {
  return ratioDefC !== null;
}

// 장비 위력 스케일(A 방향) — 장비의 물공/마공/물방/마방 위력에 곱. 1.0=현재. 캘리브로 장비가
// 양적 파워의 ~40~60% 되게 상향용. 옵션(crit/mp/eva/hp)·무게는 불변. 기본 1.0(라이브·테스트 무변).
let gearPowerScale = 1;
export function setGearPowerScale(s: number): void {
  gearPowerScale = s > 0 ? s : 1;
}
export function gearPowerScaleValue(): number {
  return gearPowerScale;
}

// 스킬 데미지 스케일 — v2 스킬(액티브) 데미지 계수에 곱. 1.0=현재. 스킬 버스트(2~5턴 처치)가
// 전투를 지배해 winT 스프레드가 큰 것을 완화(전투 길이↑·빌드 간 균질화). 평타·미러(스킬無)는 불변.
let skillDamageScale = 1;
export function setSkillDamageScale(s: number): void {
  skillDamageScale = s > 0 ? s : 1;
}

// 사제 즉발 신성딜 스케일 — derive 의 passiveTurnHolyDamage 에 곱. 1.0=현재. SPI 가 홀리 구동이라
// 다른 빌드보다 느린(winT) 것을 맞추는 다이얼. 스킬 스케일과 독립.
let holyDamageScale = 1;
export function setHolyDamageScale(s: number): void {
  holyDamageScale = s > 0 ? s : 1;
}
export function holyDamageScaleValue(): number {
  return holyDamageScale;
}

// 사제 홀리딜 누적(ramp) — 턴마다 홀리딜이 base × (1 + 완료턴수 × ramp) 로 증가. "버틸수록 강해지는"
// 지속/소모전 정체성. 기본 0 = 누적 없음(현재·라이브 무변). engine applyPassiveHolyStrikeIfAny 가 사용.
let holyRamp = 0;
export function setHolyRamp(r: number): void {
  holyRamp = r >= 0 ? r : 0;
}
export function holyRampValue(): number {
  return holyRamp;
}

// §B 명중 비율식 — hit% = clamp(10, 95, (acc + C)/(acc + eva×k + C)). §D 시드 k=1, C=0.
// C↑ = 전반 명중↑(회피 약화), k↑ = 회피 강화. 빼기(%p) 모델의 "고회피=무적/저명중=헛방" 양극단 완화.
// §B 모델(setV2BattleModel)에서만 엔진이 사용 — 라이브/테스트(OFF)는 기존 %p 차감 유지.
let v2HitK = 1;
let v2HitC = 0;
export function setV2HitParams(k: number, c: number): void {
  v2HitK = k >= 0 ? k : 1;
  v2HitC = c >= 0 ? c : 0;
}
export function v2HitChancePct(acc: number, eva: number): number {
  const a = Math.max(0, acc);
  const e = Math.max(0, eva);
  const denom = a + e * v2HitK + v2HitC;
  if (denom <= 0) return 95; // acc·eva·C 전부 0 → 최대 명중
  return Math.min(95, Math.max(10, ((a + v2HitC) / denom) * 100));
}

// §B 다단감쇠 — 턴 내 N번째 공격(0-base)의 데미지 배율. §D 시드: 1타 ×1.0·2타 ×0.5·3타+ ×0.3.
// 多타 빌드(高속도/DEX)가 선형으로 강해지는 것 방지(수확체감). 크리·속성 발동기회는 안 줄임(데미지만).
export const V2_MULTIHIT_FALLOFF: readonly number[] = [1, 0.5, 0.3];
export function v2MultiHitFalloff(ordinal: number): number {
  if (ordinal <= 0) return 1;
  return ordinal < V2_MULTIHIT_FALLOFF.length
    ? V2_MULTIHIT_FALLOFF[ordinal]
    : V2_MULTIHIT_FALLOFF[V2_MULTIHIT_FALLOFF.length - 1];
}

export function rollV2BasicDamage(args: {
  atk: number;
  def: number;
  /** §B damageFloorPct (0~0.9 캡). 천장 대비 바닥 비율. */
  floorPct: number;
  /** §B 속성 상성 배율. 미지정 = 1. */
  elementMult?: number;
}): number {
  // 천장 — 빼기(atk−def) 또는 비율경감(atk×C/(C+def)). 비율이면 def 가 %로만 깎아 절벽 없음.
  const ceiling =
    ratioDefC !== null
      ? Math.max(1, Math.round((args.atk * ratioDefC) / (ratioDefC + Math.max(0, args.def))))
      : Math.max(1, args.atk - args.def);
  const pct = Math.min(V2_DAMAGE_FLOOR_PCT_CAP, Math.max(0, args.floorPct));
  const floorAmt = ceiling * pct;
  const rolled = v2BattleModelEnabled
    ? floorAmt + battleRandom() * (ceiling - floorAmt)
    : ceiling;
  return Math.max(1, Math.floor(rolled * (args.elementMult ?? 1)));
}

// 포션 회복량(정수, 현재 HP 클램프 전). computeHealAmount 에 potionHealPct(연단의 룬 등) 가산.
// HP 클램프·상태 반영·로그는 상태 모델이 다른 각 엔진이 직접 처리한다.
export function potionHealAmount(
  potion: Potion,
  maxHp: number,
  potionHealPct: number,
): number {
  const baseHeal = computeHealAmount(potion, maxHp);
  return Math.floor(baseHeal * (1 + (potionHealPct ?? 0) / 100));
}

// ── v2 DoT (PR-8) ─────────────────────────────────────────────────────────
// 지속 피해 (출혈/소각/한기/독 등). v2 스킬 effect kind "dot" 의 결과로 target 에 박힘.
// 매 target 의 turn 진입 시 tick — 각 dot 의 turns -= 1 + dmgPerTurn 합산하여 target HP 차감.
// turns <= 0 dot 은 drop. DEF 무시.
// 같은 label 박히면 refresh (turns 새 값으로 덮어쓰기) — 정책 단순화.
export type V2Dot = { label: string; dmgPerTurn: number; turns: number };
export type V2DotList = readonly V2Dot[];

// tick: dot 들 turns -1 + 총 dmg 합산. turns 0 도달 dot drop.
// turns +0 시드 정책 — applyV2DotsToTarget 가 그대로 박음 (cd/buff 의 +1 시드와 다름).
// 이유: dot 은 tick 시점에 즉시 dmg 적용 + turns-1. buff 는 tick 후 turns > 0 이어야 active.
export function tickV2Dots(dots: V2DotList): { nextDots: V2Dot[]; totalDmg: number } {
  const nextDots: V2Dot[] = [];
  let totalDmg = 0;
  for (const d of dots) {
    if (d.turns <= 0) continue;
    totalDmg += Math.max(0, d.dmgPerTurn);
    if (d.turns > 1) nextDots.push({ ...d, turns: d.turns - 1 });
    // turns === 1 → drop (이번 turn 이 마지막 적용).
  }
  return { nextDots, totalDmg };
}

// target 의 dot 목록 갱신. 같은 label 이 들어오면 refresh (덮어쓰기), 새 label 은 append.
// turns 는 그대로 박는다 — tick 시점에 즉시 dmg 적용 + turns-1 패턴이라 cd 의 +1 시드 패턴과 다름.
// 의도: N=3 → 3번 tick 마다 dmg 적용.
export function applyV2DotsToTarget(
  current: V2DotList,
  toApply: ReadonlyArray<{ label: string; dmgPerTurn: number; turns: number }>,
): V2Dot[] {
  if (toApply.length === 0) return [...current];
  const byLabel = new Map<string, V2Dot>(current.map((d) => [d.label, d]));
  for (const a of toApply) {
    byLabel.set(a.label, {
      label: a.label,
      dmgPerTurn: a.dmgPerTurn,
      turns: a.turns,
    });
  }
  return Array.from(byLabel.values());
}

// ── v2 스킬 런타임 (PR-4a~b) ──────────────────────────────────────────────
// v2 스탯 스킬 시스템 (v2_skill_*, V2_SKILLS) 의 전투 런타임 헬퍼. PR-7a 부터 옛 spell
// 시스템 (data/v2/spells.ts) 폐기 — 모든 마법은 V2SkillsState 로 통합. MP 풀은 단판 풀충전 모델.

export type V2SkillCooldowns = Partial<Record<V2SkillId, number>>;

// v2 스킬 selfBuff/enemyDebuff 의 stat 별 시한부 효과. PR-4b.
// pct 정수 퍼센트, turns 남은 턴 (매 player turn 진입 시 -1, 0 도달이면 제거).
// 같은 stat 키에 새 buff/debuff 가 박히면 덮어쓰기 (refresh) — pct/turns 새 값으로.
export type V2BuffEntry = { pct: number; turns: number };
export type V2BuffMap = Partial<Record<StatKey, V2BuffEntry>>;

// 매 player turn 진입 시 turns -1. 0 이하 키는 제거.
export function tickV2BuffMap(map: V2BuffMap): V2BuffMap {
  const next: V2BuffMap = {};
  for (const [stat, entry] of Object.entries(map)) {
    if (!entry) continue;
    if (entry.turns > 1) next[stat as StatKey] = { pct: entry.pct, turns: entry.turns - 1 };
    // turns <= 1 → drop.
  }
  return next;
}

// 활성화된 buff/debuff 의 stat 별 효과 % (turns > 0 인 것만). 0 이면 효과 없음.
// caller 는 stat 곱셈 보정에 사용 — 예: atk *= (1 + buffPct/100), atk *= (1 - debuffPct/100).
export function v2BuffActive(map: V2BuffMap, stat: StatKey): number {
  const entry = map[stat];
  if (!entry || entry.turns <= 0) return 0;
  return entry.pct;
}

// atk 에 기여하는 stat 의 buff/debuff 합산 → 곱셈 multiplier (1 + Σbuff% − Σdebuff%).
// PR-5a: 격리 해제 — v2 buff/debuff 가 일반 공격에도 영향. atk 기여 stat = str/dex/spd/luk.
// int 는 일반 공격 atk 와 무관 (마법/MP 자원만 관련) — 합산에서 제외.
// 0 floor — 합산 debuff 가 buff+100% 초과해도 atk 음수 안 되게.
// PR-2 strict §4 — 물리 atk 버프는 STR 만 (dex/spd/luk atk 보조 폐기와 일관).
const V2_ATK_STATS: readonly StatKey[] = ["str"];
export function v2AtkBuffMult(
  selfBuffs: V2BuffMap,
  selfDebuffs: V2BuffMap,
): number {
  let totalBuff = 0;
  let totalDebuff = 0;
  for (const s of V2_ATK_STATS) {
    totalBuff += v2BuffActive(selfBuffs, s);
    totalDebuff += v2BuffActive(selfDebuffs, s);
  }
  return Math.max(0, 1 + totalBuff / 100 - totalDebuff / 100);
}

// 마법 데미지에 기여하는 stat 의 buff/debuff → 곱셈 multiplier. 마법 축 = int 만.
// 물리의 v2AtkBuffMult(str/dex/spd/luk) 와 대칭 — int 는 그쪽에서 제외돼 있어 명상(int +10%
// selfBuff)·정신 안개(int enemyDebuff)가 그동안 전투 no-op 였다. 마법 경로(scaling="magic")
// 가 이 헬퍼를 쓰면서 비로소 실효를 가진다. 공격자 자신의 int buff 가 자기 마법을 키우고,
// 자신에게 박힌 int debuff(상대의 정신 안개)가 자기 마법을 깎는다. 0 floor.
export function v2MagicBuffMult(
  selfBuffs: V2BuffMap,
  selfDebuffs: V2BuffMap,
): number {
  const buff = v2BuffActive(selfBuffs, "int");
  const debuff = v2BuffActive(selfDebuffs, "int");
  return Math.max(0, 1 + buff / 100 - debuff / 100);
}

// def 에 기여하는 stat = vit 만 (다른 stat 은 def 무관).
// vit buff → +%, vit debuff → −%. 0 floor.
export function v2DefBuffMult(
  selfBuffs: V2BuffMap,
  selfDebuffs: V2BuffMap,
): number {
  const vitBuff = v2BuffActive(selfBuffs, "vit");
  const vitDebuff = v2BuffActive(selfDebuffs, "vit");
  return Math.max(0, 1 + vitBuff / 100 - vitDebuff / 100);
}

// ── v2 스킬 effect 계산 (PR-4b → PR-5a) ───────────────────────────────────
// PR-4a 의 cast 결정 + MP/cd 외에 실제 효과(damage/heal/buff/debuff) 를 계산.
// PR-5a 격리 해제: v2 buff/debuff 가 일반 공격에도 영향 → v2DamageAmount 도 공통 헬퍼
// (v2AtkBuffMult / v2DefBuffMult) 사용해 일관성 유지. scalingStat 인자 폐지 — atk 기여
// stat 전부 합산 (이전엔 def.stat 한 stat 만 사용했으나 격리 해제 의미 약해 폐기).

// v2 스킬 damage 계산. (물리) statCoef × attackerAtk × v2AtkBuffMult + baseFlat,
// (마법) statCoef × attackerMagicAtk × v2MagicBuffMult + baseFlat 을 raw 로, 적 def 에
// v2DefBuffMult(target) 곱 후 damageBetween. 일반 공격과 같은 경로(DEF 적용, 물리·마법 공유).
//   - scaling: "magic" 이면 magicAtk(INT 환산)+int 버프 배수, 아니면 atk+물리 버프 배수.
//   - attackerMagicAtk 미지정(적·구 호출) 이면 attackerAtk 로 폴백 → 물리와 동일 동작 보존.
//   - attackerSelfBuffs / attackerSelfDebuffs: 공격자 측 (물리=str/dex/spd/luk, 마법=int)
//   - targetSelfBuffs / targetSelfDebuffs: 방어자 측 (vit 만 def 에 영향)
export function v2DamageAmount(args: {
  attackerAtk: number;
  attackerMagicAtk?: number;
  // PR-2 — 공격자 최소 데미지(데미지 하한). 미지정=0(하한 1 유지).
  attackerMinDamage?: number;
  scaling?: "physical" | "magic";
  targetDef: number;
  // PR-2 — 마법 방어력. scaling="magic" 일 때 사용, 미지정이면 물리 def 폴백(몹·구호출 보존).
  targetMagicDef?: number;
  statCoef: number;
  baseFlat: number;
  attackerSelfBuffs: V2BuffMap;
  attackerSelfDebuffs: V2BuffMap;
  targetSelfBuffs: V2BuffMap;
  targetSelfDebuffs: V2BuffMap;
  // PR-5b — 스킬 속성 보정 배수. 평타속성(atk 에 baked) 대비 스킬속성으로 재정규화한 비율.
  // 미지정/1 = 보정 없음(평타속성 그대로). atk 기여분(base)에만 적용, baseFlat 은 불변.
  elementMult?: number;
}): number {
  const isMagic = args.scaling === "magic";
  const base =
    (isMagic ? args.attackerMagicAtk ?? args.attackerAtk : args.attackerAtk) *
    (args.elementMult ?? 1);
  const mult = isMagic
    ? v2MagicBuffMult(args.attackerSelfBuffs, args.attackerSelfDebuffs)
    : v2AtkBuffMult(args.attackerSelfBuffs, args.attackerSelfDebuffs);
  const defMult = v2DefBuffMult(args.targetSelfBuffs, args.targetSelfDebuffs);
  const rawAtk =
    Math.floor(base * mult * args.statCoef * skillDamageScale) + args.baseFlat;
  // 마법 데미지는 마법 방어력으로 경감(미지정=물리 def 폴백). 물리는 물리 def.
  const defStat = isMagic ? args.targetMagicDef ?? args.targetDef : args.targetDef;
  const effectiveDef = Math.floor(defStat * defMult);
  // 데미지 하한 = max(1, 공격자 최소 데미지). 저-atk 빌드의 바닥 데미지 보장.
  const floor = Math.max(1, args.attackerMinDamage ?? 0);
  return Math.max(floor, rawAtk - effectiveDef);
}

// v2 스킬 heal 계산. pctMaxHp × maxHp / 100 + flat (caller 가 maxHp 클램프).
export function v2HealAmount(args: {
  attackerMaxHp: number;
  pctMaxHp: number;
  flat: number;
  // PR-2 — 회복량 배수(활력·정신). 미지정=1.
  healMult?: number;
}): number {
  const pctPart = Math.floor((args.attackerMaxHp * args.pctMaxHp) / 100);
  const base = Math.max(0, pctPart + args.flat);
  return Math.floor(base * (args.healMult ?? 1));
}

// MP-throttle 모델 — 전 스킬 쿨다운 폐지(데이터 cooldown:0), MP 소모량이 유일 throttle.
// 직업 시그니처(requireClass)는 mpCost:0 = "직업 차수별 자동 산정"(아래 표). 개별 비용을
// 지정하려면 0 이 아닌 literal 을 박으면 override. 비-시그니처 학습 스킬은 literal 그대로.
export const V2_SIGNATURE_MP_BY_TIER: Record<1 | 2 | 3 | 4, number> = {
  1: 12,
  2: 16,
  3: 20,
  4: 24,
};

export function v2SkillMpCost(def: V2SkillDefinition): number {
  const rc = def.learn?.requireClass;
  // 시그니처 + mpCost 미지정(0) → 직업 차수별 기본 비용. literal 박혀 있으면 그 값 우선.
  if (rc && def.mpCost === 0) {
    return V2_SIGNATURE_MP_BY_TIER[V2_CLASS_DEFS[rc].tier];
  }
  return def.mpCost;
}

// PR-5b — monster.v2MaxMp 미지정 시 자동 시드. equipped 중 max mpCost × 3 → 약 3-5 회 cast.
// 0 = equipped 비어 cast 불가능. monster 데이터 작성 부담 줄이는 default.
export function defaultV2MaxMpFor(skills: V2SkillsState): number {
  if (skills.equipped.length === 0) return 0;
  let maxCost = 0;
  for (const id of skills.equipped) {
    const def = V2_SKILLS[id];
    const cost = def ? v2SkillMpCost(def) : 0;
    if (cost > maxCost) maxCost = cost;
  }
  return maxCost * 3;
}

export function emptyV2SkillCooldowns(): V2SkillCooldowns {
  return {};
}

// 매 플레이어 턴 진입 시 호출. 양수 카운터 -1 (0 이하 키는 삭제 — ready 상태).
export function tickV2SkillCooldowns(map: V2SkillCooldowns): V2SkillCooldowns {
  const next: V2SkillCooldowns = {};
  for (const [id, n] of Object.entries(map)) {
    if (typeof n !== "number") continue;
    if (n > 1) next[id as V2SkillId] = n - 1;
    // n <= 1 → drop (0 = ready, 음수는 정상 상태 아님이나 보수적으로 drop).
  }
  return next;
}

// 슬롯 우선순위로 발동 가능한 첫 스킬 선택. 조건:
//   (a) cooldowns[id] === 0 (또는 undefined),
//   (b) mp >= def.mpCost,
//   (c) def.effects.length > 0 (효과 없는 스킬은 PR-4a 에서 skip).
// equipped 배열 순서가 우선순위 = 자동 발동 정책 (spec Section 6.4 PR-4 contract).
export function pickAutoCastV2Skill(args: {
  equipped: readonly V2SkillId[];
  cooldowns: V2SkillCooldowns;
  mp: number;
}): V2SkillId | null {
  for (const id of args.equipped) {
    const def = V2_SKILLS[id];
    if (!def) continue;
    if ((args.cooldowns[id] ?? 0) > 0) continue;
    if (args.mp < v2SkillMpCost(def)) continue;
    if (def.effects.length === 0) continue;
    return id;
  }
  return null;
}

// v2 스킬 cast 한 번의 결과.
//   PR-4a (framework):
//     - nextMp / nextCooldowns: MP 차감 + cd 세팅 후 상태
//     - castSkillId / castSkillName: 발동된 스킬 (없으면 null)
//   PR-4b (효과 적용):
//     - enemyDamage: damage effect 들의 합 (0 = 미발동)
//     - selfHeal: heal effect 들의 합 (caller 가 maxHp 클램프, 0 = 미발동)
//     - selfBuffsToApply: selfBuff effect 의 {stat,pct,turns} 목록 — caller 가 state.v2SelfBuffs 갱신
//     - enemyDebuffsToApply: enemyDebuff effect 의 {stat,pct,turns} 목록 — caller 가 target.v2SelfDebuffs 갱신
//   PR-8 (DoT 적용):
//     - dotsToApplyToTarget: dot effect 의 {label,dmgPerTurn,turns} 목록 — caller 가 target.v2Dots 갱신.
export type V2SkillBuffApply = { stat: StatKey; pct: number; turns: number };
export type V2SkillDotApply = { label: string; dmgPerTurn: number; turns: number };
export type V2SkillCastResult = {
  nextMp: number;
  nextCooldowns: V2SkillCooldowns;
  castSkillId: V2SkillId | null;
  castSkillName: string | null;
  enemyDamage: number;
  selfHeal: number;
  selfBuffsToApply: V2SkillBuffApply[];
  enemyDebuffsToApply: V2SkillBuffApply[];
  dotsToApplyToTarget: V2SkillDotApply[];
};

// PR-4b — attacker/target ctx 로 묶음. PR-4a 의 단순 mp/cd 입력에서 확장.
export type V2SkillCastInput = {
  skills: V2SkillsState;
  cooldowns: V2SkillCooldowns;
  attacker: {
    mp: number;
    atk: number;
    // 마법 공격력(INT 환산). 미지정이면 v2DamageAmount 가 atk 로 폴백 — 적·구 호출 무영향.
    // scaling="magic" 데미지 스킬만 이 값을 쓴다.
    magicAtk?: number;
    // PR-2 v2 — 최소 데미지(하한)·회복량 배수. 미지정 안전(폴백).
    minDamage?: number;
    healMult?: number;
    maxHp: number;
    selfBuffs: V2BuffMap;
    selfDebuffs: V2BuffMap;
    // PR-5b — 평타 속성(무기 ?? 캐릭, atk 에 baked)·캐릭 속성(스킬 기본). 미지정=neutral.
    attackElement?: V2Element;
    characterElement?: V2Element;
  };
  target: {
    def: number;
    // PR-2 v2 — 마법 방어력 (마법 데미지 경감, 미지정=물리 def 폴백).
    magicDef?: number;
    // PR-5a: target buff/debuff 둘 다 필요 — target.vit buff 가 def 증폭, vit debuff 가 def 감소.
    selfBuffs: V2BuffMap;
    selfDebuffs: V2BuffMap;
    // PR-5b — 피격 대상 속성(상성 계산). 미지정=neutral.
    element?: V2Element;
  };
};

const EMPTY_CAST_RESULT_BASE = {
  enemyDamage: 0,
  selfHeal: 0,
  selfBuffsToApply: [] as V2SkillBuffApply[],
  enemyDebuffsToApply: [] as V2SkillBuffApply[],
  dotsToApplyToTarget: [] as V2SkillDotApply[],
};

export function resolveV2SkillCast(input: V2SkillCastInput): V2SkillCastResult {
  // 1) cd tick.
  const ticked = tickV2SkillCooldowns(input.cooldowns);
  // 2) 발동 후보 선택.
  const id = pickAutoCastV2Skill({
    equipped: input.skills.equipped,
    cooldowns: ticked,
    mp: input.attacker.mp,
  });
  if (!id) {
    return {
      ...EMPTY_CAST_RESULT_BASE,
      nextMp: input.attacker.mp,
      nextCooldowns: ticked,
      castSkillId: null,
      castSkillName: null,
    };
  }
  const def = V2_SKILLS[id];
  // PR-5b — 스킬 속성 보정. atk 엔 평타속성(무기??캐릭)이 baked 되어 있으므로, 스킬 데미지는
  // 스킬속성(없으면 캐릭속성) 기준으로 재정규화: ×(M_skill / M_basic). 둘 다 neutral 이면 1.
  const attackEl = input.attacker.attackElement ?? "neutral";
  const charEl = input.attacker.characterElement ?? "neutral";
  const targetEl = input.target.element ?? "neutral";
  const mBasic = elementDamageMult(attackEl, targetEl);
  const mSkill = elementDamageMult(def.element ?? charEl, targetEl);
  const skillElementMult = mBasic > 0 ? mSkill / mBasic : 1;
  // 3) effect 별 결과 누산.
  let enemyDamage = 0;
  let selfHeal = 0;
  const selfBuffsToApply: V2SkillBuffApply[] = [];
  const enemyDebuffsToApply: V2SkillBuffApply[] = [];
  const dotsToApplyToTarget: V2SkillDotApply[] = [];
  for (const effect of def.effects) {
    if (effect.kind === "damage") {
      enemyDamage += v2DamageAmount({
        attackerAtk: input.attacker.atk,
        attackerMagicAtk: input.attacker.magicAtk,
        attackerMinDamage: input.attacker.minDamage,
        scaling: effect.scaling,
        targetDef: input.target.def,
        targetMagicDef: input.target.magicDef,
        statCoef: effect.statCoef,
        baseFlat: effect.baseFlat ?? 0,
        attackerSelfBuffs: input.attacker.selfBuffs,
        attackerSelfDebuffs: input.attacker.selfDebuffs,
        targetSelfBuffs: input.target.selfBuffs,
        targetSelfDebuffs: input.target.selfDebuffs,
        elementMult: skillElementMult,
      });
    } else if (effect.kind === "heal") {
      selfHeal += v2HealAmount({
        attackerMaxHp: input.attacker.maxHp,
        pctMaxHp: effect.pctMaxHp ?? 0,
        flat: effect.flat ?? 0,
        healMult: input.attacker.healMult,
      });
    } else if (effect.kind === "selfBuff") {
      selfBuffsToApply.push({
        stat: effect.stat,
        pct: effect.pct,
        turns: effect.turns,
      });
    } else if (effect.kind === "enemyDebuff") {
      enemyDebuffsToApply.push({
        stat: effect.stat,
        pct: effect.pct,
        turns: effect.turns,
      });
    } else if (effect.kind === "dot") {
      dotsToApplyToTarget.push({
        label: effect.label,
        dmgPerTurn: effect.dmgPerTurn,
        turns: effect.turns,
      });
    }
  }
  // 4) MP 차감 + cd 세팅 (cd=N → N+1 저장으로 다음 tick 후 정확히 N 유지).
  return {
    nextMp: input.attacker.mp - v2SkillMpCost(def),
    nextCooldowns: { ...ticked, [id]: def.cooldown + 1 },
    castSkillId: id,
    castSkillName: def.name,
    enemyDamage,
    selfHeal,
    selfBuffsToApply,
    enemyDebuffsToApply,
    dotsToApplyToTarget,
  };
}

// V2BuffMap 갱신 — selfBuff/enemyDebuff effect 의 결과를 stat 키에 박는다.
// 같은 stat 키에 새 entry 박히면 덮어쓰기 (refresh): pct/turns 새 값으로.
// turns 는 +1 박는다 — 다음 턴의 tickV2BuffMap 이 -1 하므로 정확히 N 턴 활성이 되려면 N+1 시드.
// (cd off-by-one 과 같은 패턴 — 매 player turn 진입 시 tick 후 cast/damage 계산.)
export function applyV2BuffsToMap(
  map: V2BuffMap,
  buffs: readonly V2SkillBuffApply[],
): V2BuffMap {
  if (buffs.length === 0) return map;
  const next: V2BuffMap = { ...map };
  for (const b of buffs) {
    next[b.stat] = { pct: b.pct, turns: b.turns + 1 };
  }
  return next;
}
