// 운영 전투력 상위 캐릭터로 길드 토벌전 보스 난이도를 비교한다.
// 읽기 전용: users/saves_kv를 SELECT만 하며 게임 데이터는 변경하지 않는다.
// 운영 EC2 실행:
//   NODE_PATH=./scripts/server-only-stub node --env-file=/run/adventure-rpg/production.env \
//     --env-file=.env.production --import tsx scripts/sim-guild-raid-boss.ts
// 후보 수치 비교: GUILD_RAID_SIM_VARIANTS="100:22:2,100:12:6" (anchorDepth:atk배율:방어 배율, 쉼표 구분)
// 배율은 협동 보스 재앙의 스콜피온 킹 원본 능력치 기준이다. 첫 줄 "현재값"은 코드에 들어 있는 수치 그대로다.

import { Pool } from "pg";
import { pathToFileURL } from "node:url";
import { createDatabaseConnectionOptions } from "../src/db/databaseTls.mjs";
import { COOP_BOSSES } from "../src/adventure/data/v2/coopBosses";
import {
  GUILD_RAID_BOSSES,
  type GuildRaidBossId,
} from "../src/adventure/data/v2/guildRaidBosses";
import { resolveGuildRaidBattle } from "../src/lib/server/guildRaidBattle";
import { withSeededRandom } from "./sim-v2-coop-boss";
import { loadTopPlayers, type SimPlayer } from "./sim-live-top-combat";

const TRIALS = 20;
const SEED = 20261010;
const MOUNTAIN_STAGE_BASE_HP = GUILD_RAID_BOSSES.mountain_chief_hard.stageBaseHp;
const ORIGINAL_RAID_DEFINITION = GUILD_RAID_BOSSES.canyon_predator_raid.definition;

type Variant = {
  label: string;
  current?: true;
  anchorDepth: number;
  atkMult: number;
  defMult: number;
};

type PlayerResult = {
  mountainMedian: number;
  raidMedian: number;
  ratio: number;
  raidDeathRate: number;
};

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function roundTo(value: number, unit: number): number {
  return Math.max(unit, Math.round(value / unit) * unit);
}

function parseVariants(raw: string | undefined): Variant[] {
  const current = GUILD_RAID_BOSSES.canyon_predator_raid.definition;
  const base: Variant = {
    label: "현재값",
    current: true,
    anchorDepth: current.anchorDepth,
    atkMult: 1,
    defMult: 1,
  };
  if (!raw?.trim()) return [base];
  return [
    base,
    ...raw.split(",").map((part) => {
      const [anchor, atk, def] = part.split(":").map(Number);
      if (!Number.isFinite(anchor) || anchor <= 0) {
        throw new Error(`잘못된 후보: ${part}`);
      }
      const atkMult = Number.isFinite(atk) && atk > 0 ? atk : 1;
      const defMult = Number.isFinite(def) && def > 0 ? def : 1;
      return { label: part.trim(), anchorDepth: anchor, atkMult, defMult };
    }),
  ];
}

function applyVariant(variant: Variant): void {
  const boss = GUILD_RAID_BOSSES.canyon_predator_raid;
  if (variant.current) {
    boss.definition = ORIGINAL_RAID_DEFINITION;
    return;
  }
  const coopBase = COOP_BOSSES.canyon_predator_hard.base;
  boss.definition = {
    ...ORIGINAL_RAID_DEFINITION,
    anchorDepth: variant.anchorDepth,
    base: {
      ...ORIGINAL_RAID_DEFINITION.base,
      atk: Math.round(coopBase.atk * variant.atkMult * 100) / 100,
      def: Math.round(coopBase.def * variant.defMult * 100) / 100,
      magicDef:
        coopBase.magicDef == null
          ? undefined
          : Math.round(coopBase.magicDef * variant.defMult * 100) / 100,
    },
  };
}

function quantile(values: readonly number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

function runTrials(
  player: SimPlayer,
  bossId: GuildRaidBossId,
  playerIndex: number,
): { damages: number[]; deaths: number } {
  const damages: number[] = [];
  let deaths = 0;
  for (let trial = 0; trial < TRIALS; trial += 1) {
    const result = withSeededRandom(SEED + playerIndex * 1_000 + trial, () =>
      resolveGuildRaidBattle({
        bossId,
        player: player.combat.player,
        playerMaxHp: player.combat.maxHp,
        skills: player.skills,
        playerName: "RaidSim",
      }),
    );
    damages.push(result.damageDealt);
    if (result.diedEarly) deaths += 1;
  }
  return { damages, deaths };
}

function simulatePlayers(
  players: readonly SimPlayer[],
  mountain: readonly { damages: number[] }[],
): PlayerResult[] {
  return players.map((player, index) => {
    const raid = runTrials(player, "canyon_predator_raid", index);
    const mountainMedian = median(mountain[index]?.damages ?? []);
    const raidMedian = median(raid.damages);
    return {
      mountainMedian,
      raidMedian,
      ratio: mountainMedian > 0 ? raidMedian / mountainMedian : 0,
      raidDeathRate: raid.deaths / TRIALS,
    };
  });
}

function printVariant(
  variant: Variant,
  players: readonly SimPlayer[],
  results: readonly PlayerResult[],
): void {
  const ratioMedian = median(results.map((row) => row.ratio));
  const deadPlayers = results.filter((row) => row.raidDeathRate >= 0.5).length;
  const raidDamageMedian = median(results.map((row) => row.raidMedian));
  console.log(
    `\n[${variant.label}] anchorDepth ${variant.anchorDepth} · atk x${variant.atkMult} · def x${variant.defMult}`,
  );
  console.log("순위  직업              산군 중앙      스콜 중앙      비율   스콜 사망률");
  results.forEach((row, index) => {
    console.log(
      `${String(index + 1).padStart(2)}    ${players[index].job.slice(0, 14).padEnd(16)}  ${Math.round(row.mountainMedian).toLocaleString("ko-KR").padStart(12)}  ${Math.round(row.raidMedian).toLocaleString("ko-KR").padStart(12)}  ${(row.ratio * 100).toFixed(1).padStart(5)}%  ${(row.raidDeathRate * 100).toFixed(0).padStart(4)}%`,
    );
  });
  console.log(
    `요약: 비율 중앙값 ${(ratioMedian * 100).toFixed(1)}% · 사망 캐릭터 ${deadPlayers}/${results.length} · 1위 사망률 ${((results[0]?.raidDeathRate ?? 0) * 100).toFixed(0)}% · 스콜 1회 피해 중앙값 ${Math.round(raidDamageMedian).toLocaleString("ko-KR")}`,
  );
  const ratios = results.map((row) => row.ratio);
  const unaffected = results.filter((row) => row.ratio >= 0.7).length;
  console.log(
    `편차: 비율 최소/25%/75%/최대 ${[0, 0.25, 0.75, 1].map((q) => (quantile(ratios, q) * 100).toFixed(0)).join("/")}% · 사분위 범위 ${((quantile(ratios, 0.75) - quantile(ratios, 0.25)) * 100).toFixed(0)}%p · 70% 이상 유지 ${unaffected}/${results.length}`,
  );
  console.log(
    `제안: stageBaseHp ${roundTo(MOUNTAIN_STAGE_BASE_HP * ratioMedian, 10_000).toLocaleString("ko-KR")} · bonusMinGuildDamage ${roundTo(raidDamageMedian * 30, 10_000).toLocaleString("ko-KR")}`,
  );
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const variants = parseVariants(process.env.GUILD_RAID_SIM_VARIANTS);
  const pool = new Pool({
    ...createDatabaseConnectionOptions(process.env.DATABASE_URL),
    max: 1,
    statement_timeout: 30_000,
  });
  try {
    const players = await loadTopPlayers(pool);
    if (players.length === 0) throw new Error("시뮬레이션할 캐릭터가 없습니다.");
    console.log(
      `운영 전투력 상위 ${players.length}명 · 보스당 ${TRIALS}회/인 · seed ${SEED} · 식별 정보 제외`,
    );
    const mountain = players.map((player, index) =>
      runTrials(player, "mountain_chief_hard", index),
    );
    for (const variant of variants) {
      applyVariant(variant);
      printVariant(variant, players, simulatePlayers(players, mountain));
    }
  } finally {
    GUILD_RAID_BOSSES.canyon_predator_raid.definition = ORIGINAL_RAID_DEFINITION;
    await pool.end();
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
