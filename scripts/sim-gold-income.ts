// 전투 킬당 base 골드(B) 캘리브레이션 — 일회성 분석용.
// 실행:  npx tsx scripts/sim-gold-income.ts
//        LEVEL=100 REGION=apex_throne npx tsx scripts/sim-gold-income.ts
//
// 목표: 골드 = R × Σ(kills × monster.exp). 6h 오토헌트 1세션의 세션 exp 를 실측
//      (simulateOfflineHunt = 라이브 사냥과 동일 경로)하고, 후보 R 별 세션 골드를
//      표로 뽑아 목표 밴드(만렙 ~15k~40k/세션)에 맞는 R 을 고른다.
//
// 환경 변수:
//   LEVELS    콤마구분, 기본 "25,45,65,85,100"
//   TRIALS    레벨당 반복(평균), 기본 3
//   RS        후보 R 콤마구분, 기본 "0.02,0.03,0.05,0.08"
//   REGION    강제 지정(미지정 시 recommendedLevel ≤ LEVEL 인 최고 사냥터 자동)

import { simulateOfflineHunt } from "../src/adventure/battle/offlineSim";
import { AUTO_HUNT_MAX_BATTLES, AUTO_HUNT_DURATION_MS } from "../src/adventure/battle/autoHunt";
import { pickAutoAction } from "../src/adventure/battle/pickAutoAction";
import { derivePlayerCombat } from "../src/adventure/character/derivePlayerCombat";
import { FEAT_NAMES, SKILL_NAMES } from "../src/adventure/character/skills";
import { ITEMS } from "../src/adventure/data/items";
import { MONSTERS } from "../src/adventure/data/monsters";
import type { StatKey } from "../src/adventure/data/stats";
import { WORLD_MAP, type Region, type RegionId } from "../src/adventure/data/world";

// 측정 대상: (레벨, 그 레벨대 실제 농사터). recommendedLevel ≤ 레벨인 강한 콘텐츠.
const SWEEP: { level: number; region: RegionId }[] = [
  { level: 25, region: "ruins" },
  { level: 45, region: "volcanic_badlands" },
  { level: 65, region: "starspire" },
  { level: 85, region: "throne_road" },
  { level: 100, region: "apex_throne" },
];
const TRIALS = Number(process.env.TRIALS ?? 3);
const RS = (process.env.RS ?? "0.005,0.01,0.02,0.03").split(",").map((s) => Number(s.trim()));
// 생존 보장용 평탄 파워배수 — 실제 풀빌드(강화/부여/룬/특기 완비)의 throughput 상한을
// 근사. 천장(=인플레 위험)을 보고 R 을 보수적으로 잡는 게 목적.
const POWER_MULT = Number(process.env.POWER_MULT ?? 2);

const BASE_STATS: Record<StatKey, number> = { str: 3, dex: 3, vit: 3, spd: 3, luk: 3, int: 3 };
const PT_MULT = 1.5;

// 존재 확인된 엔드 기어 고정 — 전 레벨 동일(천장 측정이므로 OK). atk/def/maxHp 에 POWER_MULT.
const GEAR = { weapon: "empyrean_blade", armor: "empyrean_mantle", accessory: "apex_regalia" } as const;

function allocate(level: number): Record<StatKey, number> {
  const points = Math.round(Math.max(0, level - 1) * PT_MULT);
  const a: Record<StatKey, number> = { str: 0, dex: 0, vit: 0, spd: 0, luk: 0, int: 0 };
  let left = points;
  const give = (k: StatKey, n: number) => {
    const v = Math.max(0, Math.min(left, n));
    a[k] += v;
    left -= v;
  };
  give("str", Math.round(points * 0.3));
  give("vit", Math.round(points * 0.25));
  give("dex", Math.round(points * 0.18));
  give("spd", Math.round(points * 0.15));
  give("luk", left);
  return a;
}

function makePlayer(level: number) {
  const flags = new Set<string>([
    "peak_giant_defeated",
    "volcano_heart_defeated",
    "starspire_keeper_defeated",
    "skyfolk_king_defeated",
    "endgame_apex_defeated",
  ]);
  const d = derivePlayerCombat({
    level,
    baseStats: BASE_STATS,
    allocatedStats: allocate(level),
    equipped: {
      weapon: ITEMS[GEAR.weapon],
      armor: ITEMS[GEAR.armor],
      accessory: ITEMS[GEAR.accessory],
    },
    equippedSkills: [SKILL_NAMES.POWER_ATTACK, SKILL_NAMES.GUARD, SKILL_NAMES.CRUSH],
    equippedFeats: [FEAT_NAMES.LIFESTEAL],
    storyFlagIds: flags,
    hp: 99999,
  });
  const m = Math.max(1, POWER_MULT);
  return {
    ...d.player,
    atk: Math.round(d.player.atk * m),
    def: Math.round(d.player.def * m),
    maxHp: Math.round(d.player.maxHp * m),
    hp: Math.round(d.player.maxHp * m),
  };
}

function regionById(id: RegionId): Region {
  return WORLD_MAP.regions.find((r) => r.id === id)!;
}

function sessionExp(killsByName: Record<string, number>): number {
  let sum = 0;
  for (const [name, count] of Object.entries(killsByName)) {
    sum += count * (MONSTERS[name]?.exp ?? 0);
  }
  return sum;
}

console.log(`\n전투 킬당 base 골드(B) 캘리브레이션 — throughput 천장 (POWER_MULT=${POWER_MULT})`);
console.log(`6h 오토헌트 1세션 (maxBattles=${AUTO_HUNT_MAX_BATTLES}, ${AUTO_HUNT_DURATION_MS / 3600000}h)`);
console.log(`골드 = R × Σ(kills × monster.exp).  TRIALS=${TRIALS}\n`);

const header = ["Lv", "region", "kills", "sessionExp", ...RS.map((r) => `gold@${r}`)];
console.log(header.map((h, i) => (i < 4 ? h.padEnd(i === 1 ? 18 : 11) : h.padStart(11))).join(""));
console.log("─".repeat(11 * 3 + 18 + 11 * RS.length));

for (const { level, region: regionId } of SWEEP) {
  const region = regionById(regionId);
  let kills = 0;
  let sExp = 0;
  for (let t = 0; t < TRIALS; t++) {
    const player = makePlayer(level);
    const res = simulateOfflineHunt({
      player,
      playerName: "sim",
      region,
      playerLevel: level,
      playerExp: 0,
      potions: { potion_heal_l: 999 },
      turnIntervalMs: 0,
      awayMs: AUTO_HUNT_DURATION_MS,
      maxBattles: AUTO_HUNT_MAX_BATTLES,
      pickAction: (state) =>
        pickAutoAction(state, {
          rules: [
            { enabled: true, target: "hp_heal", trigger: { kind: "hp_below_pct", pct: 50 } },
          ],
          potions: { potion_heal_l: 999 },
        }),
      luk: 0,
      knowsRecipe: () => true,
    });
    kills += res.battles;
    sExp += sessionExp(res.killsByName);
  }
  kills = Math.round(kills / TRIALS);
  sExp = Math.round(sExp / TRIALS);
  const cells = [
    String(level).padEnd(11),
    region.id.padEnd(18),
    kills.toLocaleString().padEnd(11),
    sExp.toLocaleString().padEnd(11),
    ...RS.map((r) => Math.round(sExp * r).toLocaleString().padStart(11)),
  ];
  console.log(cells.join(""));
}
console.log("");
