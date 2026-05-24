// 진행 시뮬레이션 — Lv1→Lv100 전 진행을 빌드별로 측정.
// 각 빌드(STR/DEX/SPD/LUK/BAL) × 레벨 마일스톤(10/20/40/60/80/100) 매트릭스:
//   - 적정 지역에서 1시간 offlineSim → 전투수/exp/골드/사망
//   - 지역 보스 (해당 지역이 보스 있으면) → 100 시도 WR
// 가정: 모든 빌드 동일 tier-5(창공) 장비 — 빌드 차이는 스탯 분배만으로.
// 실행: node --import tsx scripts/sim-progression.ts
import { resolveBattle, type PlayerCombat } from "../src/adventure/battle/engine";
import { pickAutoAction } from "../src/adventure/battle/pickAutoAction";
import { derivePlayerCombat } from "../src/adventure/character/derivePlayerCombat";
import { simulateOfflineHunt } from "../src/adventure/battle/offlineSim";
import { FEAT_NAMES, SKILL_NAMES } from "../src/adventure/character/skills";
import { ITEMS } from "../src/adventure/data/items";
import { MONSTERS } from "../src/adventure/data/monsters";
import { WORLD_MAP, type Region } from "../src/adventure/data/world";
import type { StatKey } from "../src/adventure/data/stats";

type Arch = "STR" | "DEX" | "SPD" | "LUK" | "BAL";
const ARCHES: Arch[] = ["STR", "DEX", "SPD", "LUK", "BAL"];
const BASE_STATS: Record<StatKey, number> = { str: 3, dex: 3, vit: 3, spd: 3, luk: 3 };
const PT_PER_LEVEL = 1; // 실게임 1pt/레벨

// 레벨별 마일스톤 — 보스 있는 region 위주(보스WR 측정 가능).
const MILESTONES: { lvl: number; regionId: string }[] = [
  { lvl: 6, regionId: "deep_cave" }, // boss: 광맥의 수호자
  { lvl: 18, regionId: "reef_isle" }, // boss: 수심의 것
  { lvl: 20, regionId: "canyon" }, // boss: 운봉의 거인
  { lvl: 40, regionId: "phoenix_ridge" }, // no boss, 일반 사냥만
  { lvl: 55, regionId: "volcanic_badlands" }, // boss: 화산의 심장
  { lvl: 70, regionId: "starspire" }, // boss: 별을 지키는 자
  { lvl: 80, regionId: "skyfolk_ruins" }, // boss: 천공인의 왕
  { lvl: 90, regionId: "apex_throne" }, // boss: 창공의 주재
];

function regionById(id: string): Region {
  const r = WORLD_MAP.regions.find((x) => x.id === id);
  if (!r) throw new Error(`region not found: ${id}`);
  return r;
}

// 빌드별 스탯 분배 — 메인 80% · 활력 15% · 부 5%.
// 메인 80% 는 Lv65~70 에 5티어 스킬 임계(RAMPAGE/ANALYSIS/LUCKY_STAR=65) 도달을 보장하기 위해 필요.
// 메인 60% 로는 Lv70 메인스탯이 장비 보너스 포함해도 임계 미달 → 5티어 스킬 발동 안 함 → sim 오염.
function allocate(arch: Arch, level: number): Record<StatKey, number> {
  const pts = Math.max(0, level - 1) * PT_PER_LEVEL;
  const a: Record<StatKey, number> = { str: 0, dex: 0, vit: 0, spd: 0, luk: 0 };
  const main: StatKey = arch === "STR" ? "str" : arch === "DEX" ? "dex" : arch === "SPD" ? "spd" : arch === "LUK" ? "luk" : "str";
  if (arch === "BAL") {
    a.str = Math.round(pts * 0.3); a.vit = Math.round(pts * 0.25); a.dex = Math.round(pts * 0.18); a.spd = Math.round(pts * 0.15); a.luk = pts - a.str - a.vit - a.dex - a.spd;
    return a;
  }
  a[main] = Math.round(pts * 0.8);
  a.vit = Math.round(pts * 0.15);
  const sub: StatKey = arch === "STR" ? "spd" : arch === "DEX" ? "luk" : arch === "SPD" ? "str" : "dex";
  a[sub] = pts - a[main] - a.vit;
  return a;
}

// 빌드별 무기 선호 — 별·아이서·옥좌·창공 라인 공통 4종 중 메인스탯 보너스가 붙는 것.
//   blade: str+ / aegis: vit+ / lance: dex+ / grip: luk+
function weaponSuffix(arch: Arch): "blade" | "lance" | "grip" {
  if (arch === "STR" || arch === "BAL") return "blade";
  if (arch === "DEX" || arch === "SPD") return "lance"; // SPD 도 lance(dex+) — 별 라인에 spd 무기 없음
  return "grip"; // LUK
}

// 레벨 tier 별 장비 — 권장 레벨에 적정한 라인 (보스 드랍 가이드).
//   ≤30 starter / ≤55 volcano(Lv55 화산 보스) / ≤70 star(Lv70 별의 첨탑)
//   / ≤80 aether(Lv80 폐도) / ≤90 road(Lv85 옥좌의 길) / >90 empyrean(Lv90 옥좌)
// armor 는 Lv70+ 모두 star_robe (별빛 두루마기, 균형 스탯+def17) 통일 — 별 이상 라인엔 armor 슬롯 없음.
// 이전 sim 은 Lv70 측정에 empyrean(Lv90 보스 드랍) 장착 + accessory 슬롯에 mantle 미스매치로 폭발 측정 오염.
function gearFor(arch: Arch, level: number) {
  const w = weaponSuffix(arch);
  if (level <= 30) {
    return { weapon: ITEMS["bone_sword"], armor: ITEMS["bone_armor"], accessory: ITEMS["sea_charm"] };
  }
  if (level <= 55) {
    return { weapon: ITEMS["volcano_sword"], armor: ITEMS["volcano_armor"], accessory: ITEMS["volcano_core"] };
  }
  if (level <= 70) {
    return { weapon: ITEMS[`star_${w}`], armor: ITEMS["star_robe"], accessory: ITEMS["star_mantle"] };
  }
  if (level <= 80) {
    return { weapon: ITEMS[`aether_${w}`], armor: ITEMS["star_robe"], accessory: ITEMS["corridor_mantle"] };
  }
  if (level <= 90) {
    return { weapon: ITEMS[`road_${w}`], armor: ITEMS["star_robe"], accessory: ITEMS["road_mantle"] };
  }
  return { weapon: ITEMS[`empyrean_${w}`], armor: ITEMS["star_robe"], accessory: ITEMS["empyrean_mantle"] };
}

// 빌드별 풀 스킬 트리 (tier 순). slotCount 만큼 잘라서 사용.
function fullSkillsFor(arch: Arch): string[] {
  if (arch === "STR")
    return [SKILL_NAMES.POWER_ATTACK, SKILL_NAMES.CRUSH, SKILL_NAMES.EXECUTION, SKILL_NAMES.BLOODLET, SKILL_NAMES.RAMPAGE, SKILL_NAMES.IMPACT_WAVE];
  if (arch === "DEX")
    return [SKILL_NAMES.EVADE, SKILL_NAMES.COUNTER, SKILL_NAMES.PRECISION, SKILL_NAMES.SHADOW_CLONE, SKILL_NAMES.ANALYSIS, SKILL_NAMES.SHADOW_LEGION];
  if (arch === "SPD")
    return [SKILL_NAMES.DOUBLE_STRIKE, SKILL_NAMES.VANGUARD, SKILL_NAMES.LIGHTSPEED, SKILL_NAMES.FLURRY, SKILL_NAMES.GALE_CHAIN, SKILL_NAMES.ETERNAL_GALE];
  if (arch === "LUK")
    return [SKILL_NAMES.CRIT, SKILL_NAMES.DOUBLE_LUCK, SKILL_NAMES.BLOOM, SKILL_NAMES.HEAVEN_DECREE, SKILL_NAMES.LUCKY_STAR, SKILL_NAMES.UNIVERSAL_LUCK];
  return [SKILL_NAMES.POWER_ATTACK, SKILL_NAMES.GUARD, SKILL_NAMES.CRUSH, SKILL_NAMES.REGEN, SKILL_NAMES.ENDURANCE, SKILL_NAMES.BULWARK];
}

// 일반 스킬 슬롯 수 (skills.ts: BASE_NORMAL_SLOTS=3 + fifth(Lv65) + sixth(Lv90)). 특기는 featsFor 별도.
// Lv 40 의 4번째 슬롯은 일반이 아닌 특기 전용이라 normalSlots 는 변화 없음 — 직전 sim 의 +1 오류 정정.
function skillsFor(arch: Arch, level: number): string[] {
  const normalSlots = level >= 90 ? 5 : level >= 65 ? 4 : 3;
  return fullSkillsFor(arch).slice(0, normalSlots);
}

// 특기: Lv≥40 에 1 개, Lv≥90 에 2 개.
function featsFor(arch: Arch, level: number): string[] {
  if (level < 40) return [];
  const list: string[] = [];
  if (arch === "STR") list.push(FEAT_NAMES.BERSERKER);
  else if (arch === "DEX") list.push(FEAT_NAMES.ACROBAT);
  else if (arch === "SPD") list.push(FEAT_NAMES.GUST_BLADE);
  else if (arch === "LUK") list.push(FEAT_NAMES.LIFESTEAL);
  else list.push(FEAT_NAMES.LIFESTEAL);
  if (level >= 90) {
    // 2번째 슬롯 — 동일 빌드 색깔 두 번째 옵션. 단순화로 LIFESTEAL 추가(모두 sustain).
    list.push(FEAT_NAMES.ACROBAT);
  }
  return list;
}

// 스킬·특기 슬롯이 풀리려면 스토리 flag 도 필요(skills.ts 게이팅).
const ALL_STORY_FLAGS = new Set<string>([
  "peak_giant_defeated", // 4번째 슬롯 + 1번째 특기 (Lv40+)
  "volcano_heart_defeated", // 5번째 슬롯 (Lv65+)
  "endgame_apex_defeated", // 6번째 슬롯 + 2번째 특기 (Lv90+)
  "starspire_keeper_defeated",
  "skyfolk_king_defeated",
]);

function makePlayer(arch: Arch, level: number): { combat: PlayerCombat; luk: number } {
  const allocated = allocate(arch, level);
  const gear = gearFor(arch, level);
  const flags = ALL_STORY_FLAGS; // 스토리 진행 완료 가정 — 스킬·특기 슬롯 게이팅 풀림.
  const d = derivePlayerCombat({
    level,
    baseStats: BASE_STATS,
    allocatedStats: allocated,
    equipped: { weapon: gear.weapon, armor: gear.armor, accessory: gear.accessory },
    equippedSkills: skillsFor(arch, level),
    equippedFeats: featsFor(arch, level),
    storyFlagIds: flags,
    hp: 99999,
  });
  return { combat: d.player, luk: BASE_STATS.luk + allocated.luk };
}

// 1시간 offlineSim — 적정 지역에서 자동 사냥.
function hourSim(player: PlayerCombat, level: number, region: Region, luk: number) {
  const result = simulateOfflineHunt({
    player,
    playerName: "Sim",
    region,
    playerLevel: level,
    playerExp: 0,
    potions: { potion_heal_s: 30, potion_heal_m: 10 }, // 적정량 (실 ID)
    turnIntervalMs: 0,
    awayMs: 3600 * 1000, // 1시간
    pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
    luk,
    knowsRecipe: () => false,
  });
  return { battles: result.battles, wins: result.wins, exp: result.expGained, gold: result.goldGained, deaths: result.revives };
}

// 지역 보스 — region.boss 가 있으면 그 보스 base 100회 시도 WR.
function bossWR(player: PlayerCombat, region: Region): number | null {
  if (!region.boss) return null;
  const baseMonster = MONSTERS[region.boss.monsterName];
  if (!baseMonster) return null;
  let w = 0;
  const TRIALS = 100;
  for (let i = 0; i < TRIALS; i++) {
    const r = resolveBattle({ ...player, hp: player.maxHp }, baseMonster, "Sim", {
      pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
      potions: {},
      isBoss: true,
    });
    if (r.outcome === "win") w++;
  }
  return Math.round((w / TRIALS) * 100);
}

// ── 실행 ────────────────────────────────────────────────────
console.log("진행 시뮬레이션 — Lv1→Lv100 빌드별\n");
console.log("가정: 동일 tier 장비(레벨별), PT_MULT=1, 보수적 storyFlags=빈.\n");

for (const ms of MILESTONES) {
  const region = regionById(ms.regionId);
  console.log(`\n━━━ Lv${ms.lvl} · ${region.name} (권장 ${region.recommendedLevel}) ━━━`);
  console.log(
    `빌드     atk/def/hp/eva%/crit% │ 1h 전투/승  exp/시간   골드/시간  사망 │ 보스WR`,
  );
  for (const arch of ARCHES) {
    const { combat, luk } = makePlayer(arch, ms.lvl);
    const hr = hourSim(combat, ms.lvl, region, luk);
    const wr = bossWR(combat, region);
    const wrStr = wr === null ? "  -" : `${String(wr).padStart(3)}%`;
    console.log(
      `${arch.padEnd(7)} ${String(combat.atk).padStart(3)}/${String(combat.def).padStart(3)}/${String(combat.maxHp).padStart(4)}/${(combat.evasionPct ?? 0).toFixed(0).padStart(2)}/${(combat.critChancePct ?? 0).toFixed(0).padStart(2)} │ ${String(hr.battles).padStart(4)}/${String(hr.wins).padStart(4)}  ${String(hr.exp).padStart(7)}  ${String(hr.gold).padStart(7)}  ${String(hr.deaths).padStart(3)} │ ${wrStr}`,
    );
  }
}

console.log(
  "\n해석:\n  - '보스WR' 0% = 해당 빌드가 그 지역 보스를 못 깨는 벽.\n  - '1h 승' 매우 낮으면 일반 사냥도 버거운 벽.\n  - 빌드 간 격차 = 메타 빌드 지배 신호.",
);
