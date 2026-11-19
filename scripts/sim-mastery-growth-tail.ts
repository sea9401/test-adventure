// 숙련도 성장 곡선 뒤쪽 보강(선형 항) 후보를 운영 스냅샷으로 비교한다.
// 스냅샷은 이름·이메일 없이 내려받은 JSON 파일이며 DB에 접속하지 않는다.
// 각 후보로 "다음 생애 Lv.100 기대 스탯"과 N일 뒤 전망을 만들고, 태초의 성소를 가산치별로 돌려
// 절반 이상 완주하는 최고 가산치를 잰다(가산치 24 = 하드, 이후 8마다 심층 1단계).
// 실행: NODE_PATH=./scripts/server-only-stub nice -n 19 node --env-file=.env.production --import tsx scripts/sim-mastery-growth-tail.ts --snapshot=<파일> [--runs=6] [--wins=7200] [--days=0,180]

import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { resolveBattle } from "../src/adventure/v2/combat/engine";
import { pickAutoAction } from "../src/adventure/v2/combat/pickAutoAction";
import { LIMITED_RECOVERY_SKILL_IDS, type LimitedRecoverySkillId } from "../src/adventure/data/v2/v2Skills";
import { stormExpeditionEnemy } from "../src/adventure/data/v2/stormExpedition";
import {
  DEFAULT_SANCTUARY_AUTO_PREFERENCES, advanceSanctuary, createSanctuaryActive,
  pickSanctuaryAutoChoice, sanctuaryNode,
} from "../src/adventure/data/v2/sanctuaryDungeon";
import { applyBattleBonuses, applyChoice, consumeBattleEffects, stormEffectiveMaxMp } from "../src/lib/server/expeditionEffects";
import { EMBLEM_GROWTH_MAX, parseEmblemState } from "../src/adventure/data/v2/emblems";
import {
  V2_CULT_CRIT_TABLE, capGain, cultivationCost, effectiveStatCap, parseProficiency, usablePoints,
} from "../src/adventure/data/v2/proficiency";
import { masteryGrowthBonus, statGrowthMasteryTotals } from "../src/adventure/data/v2/statGrowthMastery";
import { V2_STAT_KEYS, type V2StatKey } from "../src/adventure/data/v2/v2StatKeys";
import { loadTopPlayers, type SimPlayer } from "./sim-live-top-combat";

const SEED = 20261120;
const arg = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=")[1];
const SNAPSHOT = arg("snapshot");
const RUNS = Number(arg("runs") ?? 6);
const WINS_PER_DAY = Number(arg("wins") ?? 7200);
const DAYS = (arg("days") ?? "0,180").split(",").map(Number);
const POINTS_PER_WIN = 5;
/** 승리 1회가 여섯 스탯의 관련 숙련도에 더하는 양의 합(직업 프로필 가중치 평균). */
const MASTERY_WEIGHT_PER_WIN = 1.7;
const BONUS_STEP = Number(arg("step") ?? 16);
const BONUS_MAX = 24 + BONUS_STEP * Math.ceil(640 / BONUS_STEP);
/** --raw: 계정별 결과를 JSON 한 줄로도 찍는다(여러 프로세스로 나눠 돌린 뒤 합칠 때). */
const RAW = process.argv.includes("--raw");

type Tail = (mastery: number) => number;
const CANDIDATES: Record<string, Tail> = {
  "현행": () => 0,
  "30만당 +1": (mastery) => mastery / 300_000,
  "20만당 +1": (mastery) => mastery / 200_000,
};

type StatMap = Record<V2StatKey, number>;
type SnapshotRow = { user_id: string; email: null; game_name: null; saves: Record<string, unknown> };

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const statMap = (fn: (stat: V2StatKey) => number) =>
  Object.fromEntries(V2_STAT_KEYS.map((stat) => [stat, fn(stat)])) as StatMap;

const cultivationExpectedMult = (() => {
  let rest = 1;
  let expected = 0;
  let previous = 0;
  for (const { p, mult } of V2_CULT_CRIT_TABLE) {
    expected += (p - previous) * mult;
    rest -= p - previous;
    previous = p;
  }
  return expected + rest;
})();

/** 한 계정의 N일 뒤 수행 이득·생애 시작 스탯·성장분 기대값. 수행은 성장량이 한계를 넘는 스탯에만 쓴다. */
function projectProficiency(row: SnapshotRow, tail: Tail, days: number): Record<string, unknown> {
  const raw = row.saves["proficiency.v2"] as Record<string, unknown>;
  const prof = parseProficiency(raw);
  const emblems = parseEmblemState((row.saves["character.v2"] as { emblems?: unknown }).emblems);
  const emblemAvg = statMap(() => 0);
  for (const iid of emblems.slots) {
    const emblem = emblems.owned.find((entry) => entry.iid === iid);
    if (emblem && emblem.kind !== "hp" && emblem.kind !== "mp") {
      emblemAvg[emblem.kind] += EMBLEM_GROWTH_MAX.stat[emblem.grade] / 2;
    }
  }
  const totals = statGrowthMasteryTotals(prof);
  const totalSum = V2_STAT_KEYS.reduce((sum, stat) => sum + totals[stat], 0) || 1;
  const share = statMap((stat) => totals[stat] / totalSum);
  const gains = statMap((stat) => capGain(prof, stat));
  let gainSum = V2_STAT_KEYS.reduce((sum, stat) => sum + gains[stat], 0);
  let points = usablePoints(prof);
  let start = statMap(() => 0);
  let natural = statMap(() => 0);
  for (let day = 0; day <= days; day += 1) {
    start = statMap((stat) => 15 + Math.floor(22 * masteryGrowthBonus(totals[stat])));
    natural = statMap((stat) =>
      start[stat] + 99 * ((1 + masteryGrowthBonus(totals[stat]) + tail(totals[stat])) / 2 + emblemAvg[stat]));
    for (let guard = 0; guard < 500; guard += 1) {
      const cost = cultivationCost(gainSum);
      if (points < cost) break;
      let best: V2StatKey | null = null;
      let over = 0;
      for (const stat of V2_STAT_KEYS) {
        const overflow = natural[stat] - effectiveStatCap(gains[stat]);
        if (overflow > over) { over = overflow; best = stat; }
      }
      if (!best) break;
      points -= cost;
      gains[best] += 4 * cultivationExpectedMult;
      gainSum += 4 * cultivationExpectedMult;
    }
    if (day === days) break;
    for (const stat of V2_STAT_KEYS) totals[stat] += WINS_PER_DAY * MASTERY_WEIGHT_PER_WIN * share[stat];
    points += WINS_PER_DAY * POINTS_PER_WIN;
  }
  const caps = statMap((stat) => Math.round(gains[stat]));
  const grown = statMap((stat) =>
    Math.max(0, Math.round(Math.min(effectiveStatCap(caps[stat]), natural[stat])) - start[stat]));
  return { ...raw, caps, grown, lifeStartStats: start };
}

/** sim-sanctuary-hard.ts와 같은 진행 규칙. 완주하면 true. */
function simulateRun(player: SimPlayer, depthBonus: number): boolean {
  const base = player.combat.player;
  const maxHp = base.maxHp;
  const baseMaxMp = base.maxMp ?? 0;
  let active = createSanctuaryActive(maxHp, baseMaxMp);
  while (true) {
    const node = sanctuaryNode(active);
    if (node.kind !== "battle") {
      const choiceId = pickSanctuaryAutoChoice(active, DEFAULT_SANCTUARY_AUTO_PREFERENCES);
      const chosen = choiceId ? applyChoice(active, node.kind, choiceId, maxHp, baseMaxMp) : null;
      if (!chosen) throw new Error(`choice failed at ${node.id}`);
      active = advanceSanctuary(chosen)!;
      continue;
    }
    const kind = node.encounterKind!;
    const maxMp = stormEffectiveMaxMp(baseMaxMp, active.boons, null);
    const fighter = applyBattleBonuses({ ...base, hp: Math.min(maxHp, active.hp), mp: Math.min(maxMp, active.mp), maxHp, maxMp }, active, kind);
    const used = new Set(active.usedRecoverySkillIds);
    const skills = { ...player.skills, equipped: player.skills.equipped.filter((id) => !used.has(id as LimitedRecoverySkillId)) };
    const battle = resolveBattle(fighter, stormExpeditionEnemy("wreckage", kind, active.encounterIndex, depthBonus), "시뮬레이션 모험가", {
      pickAction: (state) => pickAutoAction(state, { rules: [], potions: {} }),
      potions: {}, v2Skills: skills, maxTurns: 100,
      isBoss: kind === "guardian" || kind === "final_boss",
    });
    if (battle.outcome !== "win") return false;
    const next = advanceSanctuary({
      ...active, maxHp, maxMp,
      hp: Math.min(maxHp, Math.max(0, battle.finalState.playerHp) + (active.boons.includes("victory_vigor") ? Math.floor(maxHp * 0.08) : 0)),
      mp: Math.max(0, battle.finalState.playerMp), defeatedCount: active.defeatedCount + 1,
      nextBattleEffects: consumeBattleEffects(active.nextBattleEffects, kind),
      usedRecoverySkillIds: [...new Set([...active.usedRecoverySkillIds, ...LIMITED_RECOVERY_SKILL_IDS.filter((id) => (battle.finalState.v2SkillCooldowns[id] ?? 0) > 0)])],
    });
    if (!next) return true;
    active = next;
  }
}

/** 절반 이상 완주하는 최고 가산치. 노말도 못 깨면 -1. */
function highestClearedBonus(player: SimPlayer): number {
  let best = -1;
  for (const bonus of [0, ...Array.from({ length: (BONUS_MAX - 24) / BONUS_STEP + 1 }, (_, index) => 24 + index * BONUS_STEP)]) {
    let clears = 0;
    for (let run = 0; run < RUNS; run += 1) if (simulateRun(player, bonus)) clears += 1;
    if (clears * 2 < RUNS) break;
    best = bonus;
  }
  return best;
}

const quantile = (values: readonly number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};

async function main(): Promise<void> {
  if (!SNAPSHOT) throw new Error("--snapshot=<파일>이 필요합니다.");
  const rows = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as SnapshotRow[];
  console.log(`스냅샷 ${rows.length}명 · 탐험 ${RUNS}회/가산치 · 하루 ${WINS_PER_DAY}승 가정 · seed ${SEED}`);
  const originalRandom = Math.random;
  const baseline = new Map<string, number>();
  for (const days of DAYS) {
    for (const [name, tail] of Object.entries(CANDIDATES)) {
      const projected = rows.map((row) => ({
        ...row,
        saves: { ...row.saves, "proficiency.v2": projectProficiency(row, tail, days) },
      }));
      const players = await loadTopPlayers({ query: async () => ({ rows: projected }) } as unknown as Pool, Number.POSITIVE_INFINITY);
      const statSums: number[] = [];
      const bonuses: number[] = [];
      const deltas: number[] = [];
      for (const player of players) {
        Math.random = seededRandom(SEED);
        try {
          const bonus = highestClearedBonus(player);
          bonuses.push(bonus);
          if (days === DAYS[0] && name === "현행") baseline.set(player.userId, bonus);
          deltas.push(bonus - (baseline.get(player.userId) ?? bonus));
        } finally {
          Math.random = originalRandom;
        }
        const stats = player.combat.totalStats as Partial<Record<V2StatKey, number>> | undefined;
        if (stats) statSums.push(V2_STAT_KEYS.reduce((sum, stat) => sum + (stats[stat] ?? 0), 0));
      }
      const power = players.map((player) => player.rankingPower);
      if (RAW) {
        console.log(`RAW ${JSON.stringify({ days, name, rows: players.map((player, index) => ({ id: player.userId.slice(0, 8), power: player.rankingPower, bonus: bonuses[index], stats: statSums[index] })) })}`);
      }
      console.log(
        `${String(days).padStart(3)}일 · ${name.padEnd(9)} · 전투력 중앙 ${quantile(power, 0.5)} (10~90%: ${quantile(power, 0.1)}~${quantile(power, 0.9)})` +
        ` · 최고 가산치 10%/중앙/90%: ${quantile(bonuses, 0.1)}/${quantile(bonuses, 0.5)}/${quantile(bonuses, 0.9)}` +
        ` · 기준 대비 가산치 변화 중앙 ${quantile(deltas, 0.5)} (10~90%: ${quantile(deltas, 0.1)}~${quantile(deltas, 0.9)})` +
        (statSums.length ? ` · 최종 6스탯 합 중앙 ${Math.round(quantile(statSums, 0.5))}` : ""),
      );
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
