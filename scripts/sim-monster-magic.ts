// 마법몹 시전(castSkill) 회귀 sim — #1094 "라이브 마법몹이 실제 마법 주문 시전"의 밸런스 가드.
//
// 배경: hunt 라우트(dungeon/hunt/route.ts:533-553)가 사냥터 몹의 statusSkill + castSkill 을
//   엔진 적 페이즈에 seed 한다. 엔진은 슬롯순 + 쿨다운 + procChance 로 자동 시전하고, 시전 턴엔
//   평타를 생략한다. 이 sim 은 castSkill 4종(얼음정령/호수망령=arcane_bolt·성소망령=arcane_burst·
//   독안개정령=arcane_bolt)에 대해 OFF(statusSkill 만 = #1094 이전) vs ON(status+cast = 현행)
//   승률을 비교해 castSkill 단독 기여가 스파이크인지 완만한 너지인지 측정한다.
//
// 🔑 OFF/ON 둘 다 statusSkill(DoT/디버프)은 유지 — castSkill 만 토글해 그 기여만 분리한다.
//   적 구성은 라우트(route.ts:533-553)와 동일: scaleMonsterForFloor + v2Skills seed.
//
// 실행: node --import tsx scripts/sim-monster-magic.ts
//
// 해석:
//   - wrOFF/wrON = 승률 %(castSkill 없음/있음). Δwr = wrON − wrOFF(음수=ON이 더 어려움).
//   - ±CI = 두 승률의 Wilson 95% CI half-width 합(Δwr 이 이 안이면 노이즈).
//   - winT = 승리 시 평균 처치 턴. ON 에서 늘면 시전이 전투를 끌었다는 뜻.
//   - 가장 깊은 우려 = 성소망령(arcane_burst ×1.35) × 물몸 빌드(DEX)의 Δwr.

import { resolveBattle, type PlayerCombat } from "../src/adventure/v2/combat/engine";
import { pickAutoAction } from "../src/adventure/v2/combat/pickAutoAction";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import { V2_STAT_POINTS_PER_LEVEL } from "../src/adventure/data/v2/v2Stats";
import { type V2Class } from "../src/adventure/data/v2/classes";
import { V2_MONSTERS } from "../src/adventure/data/v2/v2Monsters";
import { enemiesForDepth } from "../src/adventure/data/v2/dungeon";
import { scaleMonsterForFloor } from "../src/adventure/data/v2/monsterScale";
import { floorPowerGate } from "../src/adventure/data/v2/dungeonLadder";
import { derivePowerScore } from "../src/adventure/data/v2/power";
import type { V2SkillsState } from "../src/adventure/data/v2/v2Skills";
import type {
  V2EquipmentId,
  V2EquipSlot,
} from "../src/adventure/data/v2/v2Equipment";
import type { V2StatKey } from "../src/adventure/data/v2/v2StatKeys";
import type { Monster } from "../src/adventure/data/monsters/types";

// ── 플레이어 빌드 (sim-v2-progression 의 검증된 헬퍼 부분집합 복제) ───────────────
type Arch = "DEX" | "VIT" | "INT" | "SPI" | "BAL";
const ARCHES: Arch[] = ["DEX", "VIT", "INT", "SPI", "BAL"];

function tierForLevel(level: number): 1 | 2 | 3 | 4 | 5 {
  if (level < 10) return 1;
  if (level < 25) return 2;
  if (level < 50) return 3;
  if (level < 75) return 4;
  return 5;
}

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
const RING_LINE: Record<1 | 2 | 3 | 4 | 5, V2EquipmentId> = { 1: "v2_silver_ring", 2: "v2_lucky_charm", 3: "v2_lucky_charm", 4: "v2_fate_ring", 5: "v2_fate_ring" };
const NECKLACE_LINE: Record<1 | 2 | 3 | 4 | 5, V2EquipmentId> = { 1: "v2_jade_amulet", 2: "v2_crystal_amulet", 3: "v2_crystal_amulet", 4: "v2_mana_essence", 5: "v2_mana_essence" };

function equipFor(arch: Arch, level: number): Partial<Record<V2EquipSlot, V2EquipmentId>> {
  const tier = tierForLevel(level);
  const weapon = arch === "DEX" ? WEAPON_LINE.bow[tier] : arch === "INT" ? WEAPON_LINE.staff[tier] : WEAPON_LINE.sword[tier];
  const weight: "heavy" | "light" = arch === "VIT" ? "heavy" : "light";
  return {
    weapon,
    armor: ARMOR_LINE[weight][tier],
    gloves: GLOVES_LINE[weight][tier],
    boots: BOOTS_LINE[weight][tier],
    ring: RING_LINE[tier],
    necklace: NECKLACE_LINE[tier],
  };
}

const SUB_STAT: Record<V2StatKey, V2StatKey> = { str: "vit", dex: "luk", vit: "str", int: "vit", spi: "vit", luk: "dex" };
const FILL_STAT: Record<V2StatKey, V2StatKey> = { str: "luk", dex: "vit", vit: "luk", int: "luk", spi: "luk", luk: "vit" };
function allocate(arch: Arch, level: number): Record<V2StatKey, number> {
  const total = Math.max(0, level - 1) * V2_STAT_POINTS_PER_LEVEL;
  const a: Record<V2StatKey, number> = { str: 0, dex: 0, vit: 0, int: 0, spi: 0, luk: 0 };
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

const ARCH_CLASS_T1: Record<Arch, V2Class> = { DEX: "rogue", VIT: "martial", INT: "mage", SPI: "mage", BAL: "none" };
function classForArchLevel(arch: Arch, level: number): { cls: V2Class; tier: number } {
  void level;
  const cls = ARCH_CLASS_T1[arch];
  // 코어루프는 직업 차수 보정을 평탄화했다. 장비 티어만 레벨 구간을 따르고 classTier 는 1 고정.
  return { cls, tier: 1 };
}

function makePlayer(arch: Arch, level: number): PlayerCombat {
  const { cls, tier } = classForArchLevel(arch, level);
  return derivePlayerCombatV2Pure({
    level,
    allocatedStats: allocate(arch, level),
    v2Equipped: equipFor(arch, level),
    playerClass: cls,
    classTier: tier,
    hp: undefined,
  }).player;
}

function levelForDepth(depth: number): number {
  const target = floorPowerGate(depth);
  for (let lv = 1; lv <= 2000; lv++) {
    const p = makePlayer("BAL", lv);
    const pw = derivePowerScore({ atk: p.atk, magicAtk: p.magicAtk, def: p.def, spd: p.spd, maxHp: p.maxHp, maxMp: p.maxMp });
    if (pw >= target) return lv;
  }
  return 2000;
}

function wilsonCiHalfWidth(wins: number, total: number): number {
  if (total === 0) return 0;
  const z = 1.96;
  const p = wins / total;
  const denom = 1 + (z * z) / total;
  const margin = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return (margin / denom) * 100;
}

// ── 마법몹 castSkill 토글 sim ────────────────────────────────────────────────
const CAST_KEYS = ["얼음 정령", "호수 망령", "성소 망령", "독안개 정령"];

// 밴드 항목(enemiesForDepth) → 적 Monster. mode=on 이면 status+cast, off 면 status 만 seed
//   (route.ts:533-553 동일 구성 — castSkill 만 토글해 그 기여만 분리).
type BandEntry = ReturnType<typeof enemiesForDepth>[number];
function buildEnemy(e: BandEntry, depth: number, mode: "off" | "on"): Monster | null {
  const base = V2_MONSTERS[e.key];
  if (!base) return null;
  const scaled = scaleMonsterForFloor(base, depth);
  const skills = (mode === "on" ? [e.statusSkill, e.castSkill] : [e.statusSkill]).filter(
    (s): s is NonNullable<typeof s> => s != null,
  );
  return {
    ...scaled,
    name: e.name,
    image: e.image ?? base.image,
    element: e.element ?? "neutral",
    ...(skills.length ? { v2Skills: { learned: skills, equipped: skills } } : {}),
  };
}

const TRIALS = 60;
const PLAYER_SKILLS: V2SkillsState = { learned: [], equipped: [] };

function simCell(arch: Arch, enemy: Monster, depth: number): { wr: number; ci: number; winT: number } {
  const player = makePlayer(arch, levelForDepth(depth));
  let wins = 0;
  let winTurnsSum = 0;
  for (let i = 0; i < TRIALS; i++) {
    const r = resolveBattle({ ...player, hp: player.maxHp }, enemy, "Sim", {
      pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
      potions: {},
      v2Skills: PLAYER_SKILLS,
      depth,
    });
    if (r.outcome === "win") {
      wins++;
      winTurnsSum += r.turns;
    }
  }
  return { wr: (wins / TRIALS) * 100, ci: wilsonCiHalfWidth(wins, TRIALS), winT: wins > 0 ? winTurnsSum / wins : 0 };
}

// 각 마법몹의 실제 깊이 범위 스캔(1..40) → low/mid/high 3개 깊이 픽.
function depthsForKey(key: string): number[] {
  const present: number[] = [];
  for (let d = 1; d <= 40; d++) {
    if (enemiesForDepth(d).some((e) => e.key === key)) present.push(d);
  }
  if (present.length === 0) return [];
  const lo = present[0];
  const hi = present[present.length - 1];
  const mid = present[Math.floor(present.length / 2)];
  return [...new Set([lo, mid, hi])];
}

function entryAt(key: string, depth: number): BandEntry | null {
  return enemiesForDepth(depth).find((e) => e.key === key) ?? null;
}

console.log("마법몹 시전(castSkill) 회귀 sim — OFF(statusSkill만·#1094 이전) vs ON(status+cast·현행)");
console.log(`trials/cell=${TRIALS} · 깊이별 floorPowerGate 매칭 레벨 · 플레이어 스킬 없음(평타)`);
console.log("Δwr 음수=ON이 더 어려움. |Δwr| ≤ ±CI 면 노이즈. winT=승리 평균 턴.\n");

let worst = { label: "", dwr: 0 };
for (const key of CAST_KEYS) {
  const depths = depthsForKey(key);
  if (depths.length === 0) {
    console.log(`${key}: 밴드에서 못 찾음(스킵)`);
    continue;
  }
  for (const depth of depths) {
    const e = entryAt(key, depth);
    if (!e) continue;
    const lv = levelForDepth(depth);
    const off = buildEnemy(e, depth, "off");
    const on = buildEnemy(e, depth, "on");
    if (!off || !on) continue;
    console.log(`■ ${key} · 깊이${depth}(Lv${lv}) · cast=${e.castSkill ?? "-"} / status=${e.statusSkill ?? "-"}`);
    console.log("  arch  wrOFF  wrON   Δwr   ±CI   winT(OFF→ON)");
    let poolOffWins = 0, poolOnWins = 0, poolN = 0, poolWinTOff = 0, poolWinTOn = 0;
    for (const arch of ARCHES) {
      const o = simCell(arch, off, depth);
      const n = simCell(arch, on, depth);
      const dwr = n.wr - o.wr;
      const ci = o.ci + n.ci;
      if (Math.abs(dwr) > Math.abs(worst.dwr)) worst = { label: `${key} d${depth} ${arch}`, dwr };
      console.log(
        `  ${arch.padEnd(4)}  ${o.wr.toFixed(0).padStart(4)}%  ${n.wr.toFixed(0).padStart(4)}%  ${(dwr >= 0 ? "+" : "") + dwr.toFixed(0).padStart(3)}  ±${ci.toFixed(0).padStart(2)}   ${o.winT.toFixed(1)}→${n.winT.toFixed(1)}`,
      );
      poolOffWins += o.wr; poolOnWins += n.wr; poolN += 1; poolWinTOff += o.winT; poolWinTOn += n.winT;
    }
    const poolOff = poolOffWins / poolN, poolOn = poolOnWins / poolN;
    console.log(
      `  POOL  ${poolOff.toFixed(0).padStart(4)}%  ${poolOn.toFixed(0).padStart(4)}%  ${((poolOn - poolOff) >= 0 ? "+" : "") + (poolOn - poolOff).toFixed(0).padStart(3)}        ${(poolWinTOff / poolN).toFixed(1)}→${(poolWinTOn / poolN).toFixed(1)}\n`,
    );
  }
}
console.log(`최대 |Δwr| 셀: ${worst.label} (Δwr=${worst.dwr.toFixed(0)}%p)`);
