// 태초의 성소 난이도별 완주율을 운영 캐릭터 스냅샷으로 점검한다.
// 읽기 전용: users/saves_kv를 SELECT만 하며 게임 데이터는 변경하지 않는다.
// 진행 규칙은 /api/v2/sanctuary-dungeon 일괄 진행과 같다(기본 선호 순서, 중간 귀환 없음).
// 운영 EC2 실행: nice -n 19 node --env-file=/run/adventure-rpg/production.env --env-file=.env.production --import tsx scripts/sim-sanctuary-hard.ts [--bonuses=0,8,10,12] [--runs=30] [--top-pct=30]

import { Pool } from "pg";
import { createDatabaseConnectionOptions } from "../src/db/databaseTls.mjs";
import { resolveBattle } from "../src/adventure/v2/combat/engine";
import { pickAutoAction } from "../src/adventure/v2/combat/pickAutoAction";
import { LIMITED_RECOVERY_SKILL_IDS, type LimitedRecoverySkillId } from "../src/adventure/data/v2/v2Skills";
import { stormExpeditionEnemy } from "../src/adventure/data/v2/stormExpedition";
import {
  DEFAULT_SANCTUARY_AUTO_PREFERENCES, advanceSanctuary, canEnterSanctuary, createSanctuaryActive,
  pickSanctuaryAutoChoice, sanctuaryNode,
} from "../src/adventure/data/v2/sanctuaryDungeon";
import { applyBattleBonuses, applyChoice, consumeBattleEffects, stormEffectiveMaxMp } from "../src/lib/server/expeditionEffects";
import { loadTopPlayers, type SimPlayer } from "./sim-live-top-combat";

const SEED = 20261021;
const arg = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=")[1];
const BONUSES = (arg("bonuses") ?? "0,8,10,12").split(",").map(Number);
const RUNS = Number(arg("runs") ?? 30);
const TOP_PCT = Number(arg("top-pct") ?? 30);

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

type RunTrace = { failedAt?: string; reason?: string; bossTurns?: number; bossHpLeftPct?: number };
/** 한 번의 탐험. 이긴 전투 수(0~7)를 돌려준다. 7이면 완주. trace가 있으면 패배 지점·원인을 기록한다. */
function simulateRun(player: SimPlayer, depthBonus: number, trace?: RunTrace): number {
  const base = player.combat.player;
  const maxHp = base.maxHp;
  const baseMaxMp = base.maxMp ?? 0;
  let active = createSanctuaryActive(maxHp, baseMaxMp);
  let wins = 0;
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
    if (trace && kind === "final_boss") trace.bossTurns = battle.turns;
    if (battle.outcome !== "win") {
      if (trace) {
        trace.failedAt = kind;
        trace.reason = battle.endReason ?? "death";
        trace.bossHpLeftPct = Math.round((Math.max(0, battle.finalState.enemyHp) / Math.max(1, battle.finalState.enemy.hp)) * 100);
      }
      return wins;
    }
    wins += 1;
    const next = advanceSanctuary({
      ...active, maxHp, maxMp,
      hp: Math.min(maxHp, Math.max(0, battle.finalState.playerHp) + (active.boons.includes("victory_vigor") ? Math.floor(maxHp * 0.08) : 0)),
      mp: Math.max(0, battle.finalState.playerMp), defeatedCount: active.defeatedCount + 1,
      nextBattleEffects: consumeBattleEffects(active.nextBattleEffects, kind),
      usedRecoverySkillIds: [...new Set([...active.usedRecoverySkillIds, ...LIMITED_RECOVERY_SKILL_IDS.filter((id) => (battle.finalState.v2SkillCooldowns[id] ?? 0) > 0)])],
    });
    if (!next) return wins;
    active = next;
  }
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ ...createDatabaseConnectionOptions(process.env.DATABASE_URL), max: 1, statement_timeout: 30_000 });
  let ranked: SimPlayer[];
  try {
    // 모수는 성소에 입장할 수 있는 캐릭터만. 미해금 캐릭터는 하드 대상이 아니다.
    ranked = (await loadTopPlayers(pool, Number.POSITIVE_INFINITY)).filter((player) => canEnterSanctuary(player.character));
  } finally {
    await pool.end();
  }
  const total = ranked.length;
  const simCount = Math.max(1, Math.ceil(total * TOP_PCT / 100));
  const players = ranked.slice(0, simCount);
  const top10 = Math.max(1, Math.ceil(total * 0.1));
  if (process.argv.includes("--depths")) {
    const depths = ranked.map((player) => player.frontierDepth);
    for (const [label, from, to] of [["상위 0~5%", 0, Math.ceil(total * 0.05)], ["상위 5~10%", Math.ceil(total * 0.05), Math.ceil(total * 0.1)], ["상위 10~20%", Math.ceil(total * 0.1), Math.ceil(total * 0.2)], ["상위 20~50%", Math.ceil(total * 0.2), Math.ceil(total * 0.5)]] as const) {
      const band = [...depths.slice(from, to)].sort((a, b) => a - b);
      console.log(`${label} 사냥 도달 깊이 최소/중앙/최대 ${band[0]}/${band[Math.floor((band.length - 1) / 2)]}/${band.at(-1)}`);
    }
    return;
  }
  const diagnose = arg("diagnose");
  if (diagnose) {
    const bonus = Number(diagnose);
    const originalRandom = Math.random;
    Math.random = seededRandom(SEED);
    try {
      ranked.slice(0, Math.ceil(total * TOP_PCT / 100)).forEach((player, index) => {
        const traces: RunTrace[] = [];
        for (let run = 0; run < RUNS; run += 1) { const trace: RunTrace = {}; simulateRun(player, bonus, trace); traces.push(trace); }
        const failed = traces.filter((trace) => trace.failedAt);
        const reasons = [...new Set(failed.map((trace) => `${trace.failedAt}:${trace.reason}(적HP ${trace.bossHpLeftPct}%)`))].slice(0, 3).join(", ");
        const turns = traces.map((trace) => trace.bossTurns).filter((value): value is number => value != null);
        console.log(`${String(index + 1).padStart(3)}위 · 전투력 ${player.rankingPower} · ${player.job} · 완주 ${RUNS - failed.length}/${RUNS} · 보스 턴 ${turns.length ? Math.max(...turns) : "-"} · ${reasons}`);
      });
    } finally {
      Math.random = originalRandom;
    }
    return;
  }
  console.log(`성소 입장 가능 캐릭터 ${total}명 · 상위 ${TOP_PCT}% ${simCount}명 시뮬 · 상위 10% = ${top10}명 · 탐험 ${RUNS}회/인/가산치 · seed ${SEED}`);

  const originalRandom = Math.random;
  Math.random = seededRandom(SEED);
  const clearPct = new Map<number, number[]>();
  const reachGuardianPct = new Map<number, number[]>();
  try {
    for (const bonus of BONUSES) {
      const clears: number[] = [];
      const reach: number[] = [];
      for (const player of players) {
        let cleared = 0;
        let guardian = 0;
        for (let run = 0; run < RUNS; run += 1) {
          const wins = simulateRun(player, bonus);
          if (wins === 7) cleared += 1;
          if (wins >= 6) guardian += 1;
        }
        clears.push((cleared / RUNS) * 100);
        reach.push((guardian / RUNS) * 100);
      }
      clearPct.set(bonus, clears);
      reachGuardianPct.set(bonus, reach);
    }
  } finally {
    Math.random = originalRandom;
  }

  const bands: Array<[string, number, number]> = [
    ["상위 0~10%", 0, top10],
    [`상위 10~${TOP_PCT}%`, top10, simCount],
  ];
  console.log("\n가산치  구간            인원  완주율 평균/중앙  완주 50%↑ 인원  수호자까지 평균");
  for (const bonus of BONUSES) {
    for (const [label, from, to] of bands) {
      const clears = clearPct.get(bonus)!.slice(from, to);
      const reach = reachGuardianPct.get(bonus)!.slice(from, to);
      if (clears.length === 0) continue;
      const avg = clears.reduce((sum, value) => sum + value, 0) / clears.length;
      const reachAvg = reach.reduce((sum, value) => sum + value, 0) / reach.length;
      console.log(`${(bonus === 0 ? "노말" : `+${bonus}`).padStart(5)}  ${label.padEnd(14)}  ${String(clears.length).padStart(4)}  ${avg.toFixed(1).padStart(5)}% / ${median(clears).toFixed(0).padStart(3)}%  ${String(clears.filter((value) => value >= 50).length).padStart(6)}명        ${reachAvg.toFixed(1).padStart(5)}%`);
    }
  }
  console.log("\n개인 완주율(전투력 순위 순, 식별 정보 제외)");
  players.forEach((player, index) => {
    console.log(`${String(index + 1).padStart(3)}위 · 전투력 ${player.rankingPower} · ${BONUSES.map((bonus) => `${bonus === 0 ? "노말" : `+${bonus}`} ${clearPct.get(bonus)![index].toFixed(0)}%`).join(" · ")}`);
  });
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
