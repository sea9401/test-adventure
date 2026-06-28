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

import { resolveBattle, type PlayerCombat } from "../src/adventure/v2/combat/engine";
import { pickAutoAction } from "../src/adventure/v2/combat/pickAutoAction";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import { V2_STAT_POINTS_PER_LEVEL } from "../src/adventure/data/v2/v2Stats";
import {
  V2_SKILLS,
  type V2SkillId,
  type V2SkillsState,
} from "../src/adventure/data/v2/v2Skills";
import {
  type V2Class,
} from "../src/adventure/data/v2/classes";
import { V2_MONSTERS } from "../src/adventure/data/v2/v2Monsters";
import { enemiesForDepth, depthName } from "../src/adventure/data/v2/dungeon";
import { scaleMonsterForFloor } from "../src/adventure/data/v2/monsterScale";
import { floorPowerGate } from "../src/adventure/data/v2/dungeonLadder";
import { derivePowerScore } from "../src/adventure/data/v2/power";
import { requiredExpToNext, XP_RATE_MULT } from "../src/lib/leveling";
import {
  LOOP_BATTLES_TARGET,
  V2_LEVEL_CAP,
} from "../src/adventure/data/v2/coreLoopConfig";
import type {
  V2EquipmentId,
  V2EquipSlot,
} from "../src/adventure/data/v2/v2Equipment";
import type { V2StatKey } from "../src/adventure/data/v2/v2StatKeys";
import type { Monster } from "../src/adventure/data/monsters/types";

type Arch = "STR" | "DEX" | "VIT" | "INT" | "SPI" | "LUK" | "BAL";
const ARCHES: Arch[] = ["STR", "DEX", "VIT", "INT", "SPI", "LUK", "BAL"];

// 깊이 sweep — 각 깊이의 권장 파워(floorPowerGate)에 매칭되는 레벨로 전 아키타입 sim.
// 깊이 1·2=authored(들판/깊은산), 3+=프론티어 풀 스케일. 무한 깊이서 난이도/def 절벽/spi-luk 검증.
const SIM_DEPTHS = [1, 2, 3, 5, 8, 10, 20, 50];

function tierForLevel(level: number): 1 | 2 | 3 | 4 | 5 {
  if (level < 10) return 1;
  if (level < 25) return 2;
  if (level < 50) return 3;
  if (level < 75) return 4;
  return 5;
}

// 무기: STR/VIT/LUK/BAL = sword (str+atk), DEX/SPD = bow (dex+atk+crit), INT = staff
const WEAPON_LINE: Record<"sword" | "bow" | "staff", Record<1 | 2 | 3 | 4 | 5, V2EquipmentId>> = {
  sword: { 1: "v2_iron_sword", 2: "v2_greatsword", 3: "v2_greatsword", 4: "v2_mithril_sword", 5: "v2_mithril_sword" },
  bow: { 1: "v2_wooden_bow", 2: "v2_horn_bow", 3: "v2_horn_bow", 4: "v2_starsong_bow", 5: "v2_starsong_bow" },
  staff: { 1: "v2_oak_staff", 2: "v2_obsidian_staff", 3: "v2_obsidian_staff", 4: "v2_starlit_staff", 5: "v2_starlit_staff" },
};
const ARMOR_LINE: Record<"heavy" | "light", Record<1 | 2 | 3 | 4 | 5, V2EquipmentId>> = {
  heavy: { 1: "v2_chain_mail", 2: "v2_full_plate", 3: "v2_full_plate", 4: "v2_mithril_plate", 5: "v2_mithril_plate" },
  light: { 1: "v2_leather_armor", 2: "v2_shadow_cloak", 3: "v2_shadow_cloak", 4: "v2_windweave_cloak", 5: "v2_windweave_cloak" },
};
const GLOVES_LINE: Record<"heavy" | "light", Record<1 | 2 | 3 | 4 | 5, V2EquipmentId>> = {
  heavy: { 1: "v2_leather_gloves", 2: "v2_shadow_gloves", 3: "v2_shadow_gloves", 4: "v2_windweave_gloves", 5: "v2_windweave_gloves" },
  light: { 1: "v2_leather_gloves", 2: "v2_shadow_gloves", 3: "v2_shadow_gloves", 4: "v2_windweave_gloves", 5: "v2_windweave_gloves" },
};
const BOOTS_LINE: Record<"heavy" | "light", Record<1 | 2 | 3 | 4 | 5, V2EquipmentId>> = {
  heavy: { 1: "v2_leather_boots", 2: "v2_shadow_boots", 3: "v2_shadow_boots", 4: "v2_windweave_boots", 5: "v2_windweave_boots" },
  light: { 1: "v2_leather_boots", 2: "v2_shadow_boots", 3: "v2_shadow_boots", 4: "v2_windweave_boots", 5: "v2_windweave_boots" },
};
// 반지(운)·목걸이(마법) — 6슬롯 전환 후 둘 다 착용(옛 ACC_LINE 분할).
const RING_LINE: Record<1 | 2 | 3 | 4 | 5, V2EquipmentId> = { 1: "v2_silver_ring", 2: "v2_lucky_charm", 3: "v2_lucky_charm", 4: "v2_fate_ring", 5: "v2_fate_ring" };
const NECKLACE_LINE: Record<1 | 2 | 3 | 4 | 5, V2EquipmentId> = { 1: "v2_jade_amulet", 2: "v2_crystal_amulet", 3: "v2_crystal_amulet", 4: "v2_mana_essence", 5: "v2_mana_essence" };

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

// 분배 — main 60% / sub 30% / 잔여 10% (BAL 만 5스탯 spread).
// sub 는 빌드 성격에 맞게 — STR/VIT/LUK 는 vit (탱크 보강), DEX/SPD 는 spd (다중공격),
// INT 는 vit (마법사도 hp 필요).
// 빌드별 sub/filler — main 60% / sub 30% / filler 10% (셋 다 distinct). 속도는 파생이라 분배 안 함.
const SUB_STAT: Record<V2StatKey, V2StatKey> = {
  str: "vit",
  dex: "luk",
  vit: "str",
  int: "vit",
  spi: "vit",
  luk: "dex",
};
const FILL_STAT: Record<V2StatKey, V2StatKey> = {
  str: "luk",
  dex: "vit",
  vit: "luk",
  int: "luk",
  spi: "luk",
  luk: "vit",
};
function allocate(arch: Arch, level: number): Record<V2StatKey, number> {
  const total = Math.max(0, level - 1) * V2_STAT_POINTS_PER_LEVEL;
  const a: Record<V2StatKey, number> = {
    str: 0,
    dex: 0,
    vit: 0,
    int: 0,
    spi: 0,
    luk: 0,
  };
  if (total === 0) return a;
  if (arch === "BAL") {
    a.str = Math.round(total * 0.25);
    a.vit = Math.round(total * 0.25);
    a.dex = Math.round(total * 0.2);
    a.luk = Math.round(total * 0.15);
    a.spi = total - a.str - a.vit - a.dex - a.luk;
    return a;
  }
  const main = arch.toLowerCase() as V2StatKey;
  const sub = SUB_STAT[main];
  const filler = FILL_STAT[main];
  a[main] = Math.round(total * 0.6);
  a[sub] = Math.round(total * 0.3);
  a[filler] = total - a[main] - a[sub];
  return a;
}

// 아키타입 → 4직군. 코어루프는 차수 보너스를 평탄화했으므로 classTier 는 항상 1.
// SPI=마법사(신성), LUK=도적(암살). BAL 은 무직(보정 없음).
const ARCH_CLASS_T1: Record<Arch, V2Class> = {
  STR: "warrior",
  DEX: "rogue",
  VIT: "martial",
  INT: "mage",
  SPI: "mage",
  LUK: "rogue",
  BAL: "none",
};

function classForArchLevel(
  arch: Arch,
  level: number,
): { cls: V2Class; tier: number } {
  void level;
  const cls = ARCH_CLASS_T1[arch];
  return { cls, tier: 1 };
}

function makePlayer(arch: Arch, level: number) {
  const allocated = allocate(arch, level);
  // PR-7a — 옛 spell 시스템 폐기. v2 스킬 시스템으로 통합돼 sim 도 spells 인자 폐기.
  // 스킬 장착은 SKILLS_MODE(--skills) 일 때만 — 기본은 일반 공격 기반 progression baseline.
  // playerClass + classTier=1. 구 차수별 앵커 보정/직업 패시브는 은퇴.
  const { cls, tier } = classForArchLevel(arch, level);
  return derivePlayerCombatV2Pure({
    level,
    allocatedStats: allocated,
    v2Equipped: equipFor(arch, level),
    playerClass: cls,
    classTier: tier,
    hp: undefined,
  });
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
  const ids = (Object.keys(V2_SKILLS) as V2SkillId[]).filter((id) => {
    const def = V2_SKILLS[id];
    if (def.monsterOnly) return false;
    // 학습 스킬 — 주력 스탯 일치 + 레벨/스탯 게이트.
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
  // SP 로드아웃 시뮬레이션 전 단계 — 학습한 스킬 전부를 전투 풀로 둔다.
  return { learned: ids, equipped: ordered };
}

// 깊이 풀 — enemiesForDepth(깊이) → scaled Monster(깊이 배율). 미정의 이름 스킵.
function depthMonsters(depth: number): Monster[] {
  const out: Monster[] = [];
  for (const e of enemiesForDepth(depth)) {
    const base = V2_MONSTERS[e.key];
    if (base) out.push(scaleMonsterForFloor(base, depth));
  }
  return out;
}

// 깊이 권장 파워에 맞는 레벨 — 참조 빌드(BAL) power ≥ floorPowerGate(depth) 인 최소 레벨.
// (sim 은 레벨 분배 프록시 — 라이브는 cumLevel→floor 로 같은 power 도달. 전투 밸런스엔 동치.)
function levelForDepth(depth: number): number {
  const target = floorPowerGate(depth);
  for (let lv = 1; lv <= 2000; lv++) {
    const p = makePlayer("BAL", lv).player;
    const pw = derivePowerScore({
      atk: p.atk,
      magicAtk: p.magicAtk,
      def: p.def,
      spd: p.spd,
      maxHp: p.maxHp,
      maxMp: p.maxMp,
    });
    if (pw >= target) return lv;
  }
  return 2000;
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
  depth = 1,
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
      const r = resolveBattle({ ...player, hp: player.maxHp }, enemy, "Sim", {
        pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
        potions: {},
        v2Skills,
        depth,
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

// ── 페이싱 모드(--pacing) — Lv1→50 한 루프 실제 판수 측정 ───────────────
// 각 레벨에서 "기대 exp/판(승률×승리exp)"이 최대인 깊이를 실제 전투로 찾아(합리적 플레이어
// =파워게이트 깊이) 판수 합산. 승률 낮은 깊이는 패배=0exp+세금이라 자연히 제외됨.
const PACING_MODE = process.argv.includes("--pacing");

function expPerBattleAtDepth(
  arch: Arch,
  level: number,
  depth: number,
  newbie: boolean,
): { expPerBattle: number; wrPct: number } {
  const enemies = depthMonsters(depth);
  if (enemies.length === 0) return { expPerBattle: 0, wrPct: 0 };
  const player = makePlayer(arch, level).player;
  const v2Skills: V2SkillsState = { learned: [], equipped: [] };
  const TRIALS = 8;
  let total = 0;
  let wins = 0;
  let expSum = 0;
  for (const enemy of enemies) {
    for (let i = 0; i < TRIALS; i++) {
      const r = resolveBattle({ ...player, hp: player.maxHp }, enemy, "Sim", {
        pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
        potions: {},
        v2Skills,
        depth,
      });
      total++;
      if (r.outcome === "win") {
        wins++;
        expSum += enemy.exp; // 깊이 배율 이미 반영(scaleMonsterForFloor)
      }
    }
  }
  const mult = XP_RATE_MULT * (newbie ? 2 : 1);
  return { expPerBattle: (expSum / total) * mult, wrPct: (wins / total) * 100 };
}

function runPacing() {
  console.log(
    `v2 코어루프 페이싱 — Lv1→${V2_LEVEL_CAP} 실측(목표 ${LOOP_BATTLES_TARGET}판≈100분). XP_RATE_MULT=${XP_RATE_MULT}`,
  );
  console.log(
    "모델: 레벨마다 기대 exp/판 최대 깊이(실전투 sweep, 승률 붕괴 시 조기중단). 100% 가정 아님(승률 반영).",
  );
  const archs: Arch[] = ["BAL", "STR", "INT"];
  for (const arch of archs) {
    for (const newbie of [false, true]) {
      let battles = 0;
      const samples: string[] = [];
      for (let L = 1; L < V2_LEVEL_CAP; L++) {
        let best = 0;
        let bestD = 1;
        let bestWr = 0;
        let lowStreak = 0;
        for (let d = 1; d <= 40; d++) {
          const { expPerBattle, wrPct } = expPerBattleAtDepth(arch, L, d, newbie);
          if (expPerBattle > best) {
            best = expPerBattle;
            bestD = d;
            bestWr = wrPct;
          }
          // 승률 붕괴(2연속 <15%)면 더 깊이 안 봄(deeper=더 나쁨).
          if (wrPct < 15) {
            lowStreak++;
            if (lowStreak >= 2 && d > 3) break;
          } else lowStreak = 0;
        }
        const need = requiredExpToNext(L) ?? 0;
        const b = best > 0 ? need / best : 0;
        battles += b;
        if (L === 1 || L % 10 === 0 || L === 49)
          samples.push(`L${L}(d${bestD},wr${bestWr.toFixed(0)},e/b${best.toFixed(0)})=${b.toFixed(0)}`);
      }
      console.log(
        `${arch} newbie=${newbie ? "ON " : "OFF"} → Lv1→50 = ${battles.toFixed(0)}판 (~${((battles * 5) / 60).toFixed(0)}분)`,
      );
      console.log(`   ${samples.join(" ")}`);
    }
  }
}

if (PACING_MODE) {
  runPacing();
  process.exit(0);
}

// ── 몬스터 SPD 모드(--mspd) — 깊이별 플레이어 vs 몬스터 행동 간격·비율, 깊이보정 K 제안 ─────
const MSPD_MODE = process.argv.includes("--mspd");
function runMspd() {
  console.log(
    "v2 ATB 몬스터 SPD — 깊이별 매칭레벨 플레이어 spd vs 몬스터 effective spd (행동 간격·비율).",
  );
  console.log(
    "행동비율 = 플레이어 행동수/몬스터 행동수(>1 = 플레이어가 더 자주). 깊이보정 0 기준.",
  );
  // 빌드별 spd 편차(STR 느림·DEX 빠름) — BAL/STR/DEX 대표.
  const archs: Arch[] = ["BAL", "STR", "DEX"];
  for (const d of [1, 4, 7, 11, 14, 18, 24, 30]) {
    const lvl = levelForDepth(d);
    const monsters = depthMonsters(d);
    const corr = depthSpdCorrection(d);
    const mEffs = monsters.map((m) => effectiveMonsterSpd(m.spd ?? 1, corr));
    const mIvAvg =
      mEffs.length > 0
        ? mEffs.map((e) => actionInterval(e)).reduce((a, b) => a + b, 0) /
          mEffs.length
        : 0;
    const parts: string[] = [];
    for (const arch of archs) {
      const p = makePlayer(arch, lvl).player;
      const pIv = actionInterval(p.spd);
      const ratio = mIvAvg > 0 ? mIvAvg / pIv : 0; // 몬스터간격/플레이어간격 = 플레이어 행동/몬스터 행동
      parts.push(`${arch}(spd${p.spd}·iv${pIv}·×${ratio.toFixed(2)})`);
    }
    console.log(
      `d${d} Lv${lvl} | 몬스터 eff[${Math.min(...mEffs)}-${Math.max(...mEffs)}]·iv${mIvAvg.toFixed(0)} | ${parts.join(" ")}`,
    );
  }
}
import { actionInterval, effectiveMonsterSpd, depthSpdCorrection } from "../src/adventure/v2/combat/combatTimeline";
if (MSPD_MODE) {
  runMspd();
  process.exit(0);
}

// ── 실행 ────────────────────────────────────────────────────
console.log("v2 진행 시뮬레이션 — 7 archetype × 깊이 sweep (프론티어, 권장파워-매칭 레벨)");
console.log(
  `가정: V2_STAT_POINTS_PER_LEVEL=${V2_STAT_POINTS_PER_LEVEL}, 60/30/10 분배(BAL spread), tier-by-level 장비, 층 전체 잡몹 × ${TRIALS_PER_MONSTER} trial 풀 평균.`,
);
console.log(
  SKILLS_MODE
    ? "스킬 모드 ON (--skills): 각 빌드가 주력 스탯 스킬 장착(INT=마법 경로 magicAtk 측정)."
    : "스킬 모드 OFF: 일반 공격 baseline. INT 마법 측정하려면 --skills.",
);
console.log(
  "코어루프 — 직업 차수 보정은 평탄화(classTier=1), 직업 패시브는 로드아웃/킷 기준.",
);

const pad = (s: string | number, w: number) => String(s).padStart(w);
const pct = (n: number) => n.toFixed(1).padStart(5);

// "<1" 같은 가독성 셀 만들기 — 0 이면 dash.
function turnCell(t: number, hasAny: boolean): string {
  if (!hasAny) return "  -";
  if (t < 1) return " <1";
  return t.toFixed(1);
}

for (const depth of SIM_DEPTHS) {
  const lvl = levelForDepth(depth);
  const enemies = depthMonsters(depth);
  const gate = floorPowerGate(depth);
  console.log(
    `\n━━━ 깊이 ${depth} · ${depthName(depth)} (권장파워 ${gate} ≈ Lv${lvl}, pool: ${enemies.length}종) ━━━`,
  );
  console.log(
    "Arch  STR DEX VIT INT SPI LUK │ atk def maxHp maxMp crit% eva% acc% extra% │  wr   ±95 winT lossT hpL%",
  );
  for (const arch of ARCHES) {
    const d = makePlayer(arch, lvl);
    const s = d.totalStats;
    const p = d.player;
    let combatCol = "│   -    -    -    -    -";
    if (enemies.length > 0) {
      const r = combatStats(p, enemies, skillsFor(arch, lvl, s), depth);
      const wrStr = `${r.wrPct}%`;
      const ciStr = `±${r.wrCiPct.toFixed(1)}`;
      const winT = turnCell(r.winTurns, r.wrPct > 0);
      const lossT = turnCell(r.lossTurns, r.wrPct < 100);
      const hpL = r.wrPct < 100 ? r.lossEnemyHpPct.toFixed(0) + "%" : " -";
      combatCol = `│ ${pad(wrStr, 4)} ${pad(ciStr, 5)} ${pad(winT, 5)} ${pad(lossT, 5)} ${pad(hpL, 4)}`;
    }
    console.log(
      `${arch.padEnd(5)} ${pad(s.str, 3)} ${pad(s.dex, 3)} ${pad(s.vit, 3)} ${pad(s.int, 3)} ${pad(s.spi, 3)} ${pad(s.luk, 3)} │ ${pad(p.atk, 3)} ${pad(p.def, 3)} ${pad(p.maxHp, 5)} ${pad(p.maxMp ?? 0, 5)} ${pct(p.critChancePct ?? 0)} ${pct(p.evasionPct ?? 0)} ${pct(p.accuracyPct ?? 0)} ${pct(p.extraAttackChancePct ?? 0)} ${combatCol}`,
    );
  }
}

console.log(
  "\n해석:\n  - wr%   : 풀 평균 승률.\n  - ±95   : Wilson 95% CI half-width %. 작을수록 안정. 두 빌드 wr 차이가 (±95 합) 보다 작으면 노이즈.\n  - winT  : 승리 시 평균 처치 턴 (낮을수록 강함).\n  - lossT : 패배 시 평균 사망 턴 (높을수록 끈질김 — '거의 깰 뻔' 신호).\n  - hpL%  : 패배 시 적 HP 평균 잔량 % (낮을수록 '간발 패배', 높으면 못 깎고 패배).\n  - hpL% 30% 미만 + wr 낮음 = 데미지 살짝만 올리면 회복 가능한 약점.\n  - hpL% 70%+ + wr 낮음 = 빌드 자체가 그 층 못 깸 (구조적 부족).",
);
