// 운영 숙련도 상위 캐릭터의 미개척지 후보 난이도를 실제 저장 스냅샷으로 점검한다.
// 읽기 전용: users/saves_kv를 SELECT만 하며 게임 데이터는 변경하지 않는다.
// 운영 EC2 실행:
// node --env-file=/run/adventure-rpg/production.env --env-file=.env.production --import tsx scripts/sim-unexplored-live-top.ts

import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { createDatabaseConnectionOptions } from "../src/db/databaseTls.mjs";
import {
  derivePlayerCombatV2FromSaves,
  type SavedCharacterV2,
} from "../src/lib/server/derivePlayerCombatV2";
import {
  parseV2SkillsState,
  type V2SkillsState,
} from "../src/adventure/data/v2/v2Skills";
import { sanitizeCombatLoadout } from "../src/lib/server/v2Skills";
import { codexSpBonusFromRaw } from "../src/lib/server/codexSpBonus";
import { jobUnlockContextFromSaves } from "../src/lib/server/jobUnlockContext";
import { parseClaimed } from "../src/lib/server/v2QuestContext";
import {
  parseProficiency,
  totalCumLevel,
} from "../src/adventure/data/v2/proficiency";
import {
  jobDisplayName,
  parseV2Class,
} from "../src/adventure/data/v2/classes";
import { superAdminEmails } from "../src/lib/server/adminEmailAccess";
import { resolveBattle } from "../src/adventure/v2/combat/engine";
import { pickAutoAction } from "../src/adventure/v2/combat/pickAutoAction";
import {
  UNEXPLORED_SIMULATION_DIFFICULTIES,
  unexploredBaseProxyMonsters,
  unexploredSpecialMonsters,
  type UnexploredSimulationDifficulty,
  type UnexploredSimulationMonster,
} from "../src/adventure/data/v2/unexploredSimulationMonsters";
import {
  anonymousUnexploredRankLabel,
  classifyUnexploredBuild,
  groupUnexploredRates,
  rankUnexploredCandidates,
  summarizeUnexploredRates,
  type UnexploredBuildClassification,
  type UnexploredRateMode,
  type UnexploredRateRow,
  type UnexploredRankCandidate,
} from "../src/adventure/data/v2/unexploredSimulationAnalysis";
import {
  UNEXPLORED_MONSTER_POOLS,
  type UnexploredPoolId,
} from "../src/adventure/data/v2/unexploredMonsterPools";
import {
  unexploredTempoRows,
  type UnexploredSpeedBand,
} from "../src/adventure/data/v2/unexploredSimulationBalance";

const TOP_COUNT = 30;
const TRIALS_PER_MONSTER = 30;
const SEED = 20260827;

const SAVE_KEYS = [
  "character.v2",
  "character-profile.v2",
  "equipment.v2",
  "proficiency.v2",
  "skills.v2",
  "fishing-codex.v1",
  "equipment-codex.v1",
  "farm.v2",
  "cooking.v2",
  "woodcutting-log.v1",
  "mining-log.v1",
  "guide-quests.v2",
] as const;

type SaveMap = Record<string, unknown>;

type DbRow = {
  user_id: string;
  email: string | null;
  game_name: string | null;
  banned_until: Date | string | null;
  character_updated_at: Date | string | null;
  saves: SaveMap | null;
};

type PreparedCandidate = UnexploredRankCandidate & {
  combat: NonNullable<ReturnType<typeof derivePlayerCombatV2FromSaves>>;
  skills: V2SkillsState;
  job: string;
  build: UnexploredBuildClassification;
};

type LoadResult = {
  players: PreparedCandidate[];
  scanned: number;
  ineligible: number;
  invalid: number;
};

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

function hasPublicName(row: DbRow, saves: SaveMap): boolean {
  if (typeof row.game_name === "string" && row.game_name.trim()) return true;
  const profile = saves["character-profile.v2"];
  return Boolean(
    profile &&
      typeof profile === "object" &&
      typeof (profile as { name?: unknown }).name === "string" &&
      (profile as { name: string }).name.trim(),
  );
}

function isActivelyBanned(value: Date | string | null, nowMs: number): boolean {
  if (value == null) return false;
  const untilMs = new Date(value).getTime();
  return Number.isFinite(untilMs) && untilMs > nowMs;
}

function prepareCandidate(row: DbRow): PreparedCandidate | null {
  const saves = row.saves ?? {};
  const character = saves["character.v2"] as
    | (SavedCharacterV2 & { specChoice?: unknown })
    | undefined;
  if (!character) return null;

  const storedSkills = parseV2SkillsState(saves["skills.v2"]);
  const codexBonus = codexSpBonusFromRaw(
    saves["fishing-codex.v1"],
    saves["equipment-codex.v1"],
  );
  const unlockContext = jobUnlockContextFromSaves({
    farmRaw: saves["farm.v2"],
    cookingRaw: saves["cooking.v2"],
    woodcuttingRaw: saves["woodcutting-log.v1"],
    miningRaw: saves["mining-log.v1"],
    completedQuestIds: parseClaimed(saves["guide-quests.v2"]),
  });
  const skills = sanitizeCombatLoadout(
    storedSkills,
    character,
    saves["proficiency.v2"],
    codexBonus.total,
    unlockContext,
  );
  const combat = derivePlayerCombatV2FromSaves({
    character,
    equipmentSave: saves["equipment.v2"],
    proficiencyRaw: saves["proficiency.v2"],
    skillsRaw: skills,
  });
  if (!combat) return null;

  const proficiency = parseProficiency(saves["proficiency.v2"]);
  const spec =
    typeof character.specChoice === "string" ? character.specChoice : null;
  const job = jobDisplayName(parseV2Class(character.class), spec);
  return {
    opaqueKey: row.user_id,
    totalCumLevel: totalCumLevel(proficiency),
    level: Math.max(1, Math.floor(Number(character.level) || 1)),
    updatedAtMs: Number.isFinite(new Date(row.character_updated_at ?? 0).getTime())
      ? new Date(row.character_updated_at ?? 0).getTime()
      : Number.MAX_SAFE_INTEGER,
    combat,
    skills,
    job,
    build: classifyUnexploredBuild(combat.player, skills),
  };
}

async function loadTopPlayers(pool: Pool): Promise<LoadResult> {
  const result = await pool.query<DbRow>(
    `
      SELECT
        u.id AS user_id,
        u.email,
        u.game_name,
        u.banned_until,
        MAX(s.updated_at) FILTER (WHERE s.key = 'character.v2') AS character_updated_at,
        COALESCE(
          jsonb_object_agg(s.key, s.value) FILTER (WHERE s.key IS NOT NULL),
          '{}'::jsonb
        ) AS saves
      FROM users u
      LEFT JOIN saves_kv s
        ON s.user_id = u.id
       AND s.key = ANY($1::text[])
      GROUP BY u.id, u.email, u.game_name, u.banned_until
    `,
    [SAVE_KEYS],
  );

  const admins = superAdminEmails();
  const nowMs = Date.now();
  const candidates: PreparedCandidate[] = [];
  let ineligible = 0;
  let invalid = 0;
  for (const row of result.rows) {
    const saves = row.saves ?? {};
    const admin = Boolean(
      row.email && admins.has(row.email.trim().toLowerCase()),
    );
    if (
      admin ||
      isActivelyBanned(row.banned_until, nowMs) ||
      !hasPublicName(row, saves)
    ) {
      ineligible += 1;
      continue;
    }
    const candidate = prepareCandidate(row);
    if (!candidate) {
      invalid += 1;
      continue;
    }
    candidates.push(candidate);
  }

  return {
    players: rankUnexploredCandidates(candidates, TOP_COUNT),
    scanned: result.rows.length,
    ineligible,
    invalid,
  };
}

function simulateMonster(
  player: PreparedCandidate,
  playerIndex: number,
  entry: UnexploredSimulationMonster,
  mode: UnexploredRateMode,
): UnexploredRateRow {
  let wins = 0;
  for (let trial = 0; trial < TRIALS_PER_MONSTER; trial += 1) {
    try {
      const maxMp = player.combat.player.maxMp ?? 0;
      const result = resolveBattle(
        {
          ...player.combat.player,
          hp: player.combat.maxHp,
          mp: maxMp,
        },
        entry.monster,
        "시뮬레이션 모험가",
        {
          pickAction: (state) =>
            pickAutoAction(state, { rules: [], potions: {} }),
          potions: {},
          v2Skills: player.skills,
          depth: entry.difficulty,
        },
      );
      if (result.outcome === "win") wins += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${anonymousUnexploredRankLabel(playerIndex)} · 난이도 ${entry.difficulty} · ${mode} · ${entry.monsterId}: ${message}`,
      );
    }
  }
  return {
    playerIndex,
    difficulty: entry.difficulty,
    mode,
    poolId: entry.poolId,
    job: player.job,
    buildLabel: player.build.label,
    wins,
    total: TRIALS_PER_MONSTER,
  };
}

function simulateAll(players: readonly PreparedCandidate[]): UnexploredRateRow[] {
  const rows: UnexploredRateRow[] = [];
  const originalRandom = Math.random;
  Math.random = seededRandom(SEED);
  try {
    for (const difficulty of UNEXPLORED_SIMULATION_DIFFICULTIES) {
      const base = unexploredBaseProxyMonsters(difficulty);
      const stats = unexploredSpecialMonsters(difficulty, "stats");
      const mechanics = unexploredSpecialMonsters(difficulty, "mechanics");
      players.forEach((player, playerIndex) => {
        for (const entry of base) {
          rows.push(simulateMonster(player, playerIndex, entry, "base"));
        }
        for (const entry of stats) {
          rows.push(simulateMonster(player, playerIndex, entry, "stats"));
        }
        for (const entry of mechanics) {
          rows.push(simulateMonster(player, playerIndex, entry, "mechanics"));
        }
      });
      console.log(`난이도 ${difficulty} 시뮬레이션 완료`);
    }
  } finally {
    Math.random = originalRandom;
  }
  return rows;
}

function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function rateOf(rows: readonly UnexploredRateRow[]): number {
  return summarizeUnexploredRates(rows).ratePct;
}

const SPEED_BAND_LABEL: Record<UnexploredSpeedBand, string> = {
  slow: "느림",
  normal: "일반",
  fast: "빠름",
  extreme: "극고속",
};

function printTempoCalibration(): void {
  console.log("\n[미개척지 몬스터 행동 속도 보정]");
  console.log("난이도  구간    원시 SPD  플레이어 행동 : 몬스터 행동");
  for (const row of unexploredTempoRows()) {
    console.log(
      `${String(row.difficulty).padStart(3)}     ${SPEED_BAND_LABEL[row.band].padEnd(4)} ${String(row.rawSpd).padStart(8)}  ${row.playerActionsPerMonsterAction.toFixed(2)} : 1`,
    );
  }
}

function printPlayers(players: readonly PreparedCandidate[]): void {
  console.log("\n[익명 상위 30명 빌드]");
  console.log("순위  총숙련  직업              빌드                              HP      ATK   MATK  DEF   MDEF  SPD   EVA");
  players.forEach((player, index) => {
    const combat = player.combat.player;
    console.log(
      `${anonymousUnexploredRankLabel(index).padEnd(4)} ${String(player.totalCumLevel).padStart(7)}  ${player.job.slice(0, 14).padEnd(16)}  ${player.build.label.padEnd(30)}  ${String(player.combat.maxHp).padStart(6)}  ${String(combat.atk).padStart(5)}  ${String(combat.magicAtk ?? 0).padStart(5)}  ${String(combat.def).padStart(4)}  ${String(combat.magicDef ?? combat.def).padStart(5)}  ${String(combat.spd).padStart(4)}  ${String(Math.round(combat.evaRating ?? combat.evasionPct)).padStart(4)}`,
    );
  });
}

function printDifficultySummary(rows: readonly UnexploredRateRow[]): void {
  console.log("\n[난이도 전체 요약]");
  console.log("난이도  구분       전체승률  개인 최소/p25/중앙/p75/최대       20%+/40%+/70%+");
  for (const difficulty of UNEXPLORED_SIMULATION_DIFFICULTIES) {
    for (const mode of ["base", "stats", "mechanics"] as const) {
      const summary = summarizeUnexploredRates(
        rows.filter(
          (row) => row.difficulty === difficulty && row.mode === mode,
        ),
      );
      console.log(
        `${String(difficulty).padStart(3)}     ${mode.padEnd(10)} ${pct(summary.ratePct).padStart(7)}   ${[summary.minPct, summary.p25Pct, summary.medianPct, summary.p75Pct, summary.maxPct].map((value) => value.toFixed(0).padStart(3)).join("/")}%             ${String(summary.playersAtLeast20Pct).padStart(2)}/${String(summary.playersAtLeast40Pct).padStart(2)}/${String(summary.playersAtLeast70Pct).padStart(2)}`,
      );
    }
  }
}

function poolRatesForPlayer(
  rows: readonly UnexploredRateRow[],
  playerIndex: number,
  difficulty: UnexploredSimulationDifficulty,
): Array<{ poolId: UnexploredPoolId; ratePct: number }> {
  return UNEXPLORED_MONSTER_POOLS.map((pool) => ({
    poolId: pool.id,
    ratePct: rateOf(
      rows.filter(
        (row) =>
          row.playerIndex === playerIndex &&
          row.difficulty === difficulty &&
          row.mode === "mechanics" &&
          row.poolId === pool.id,
      ),
    ),
  }));
}

const POOL_NAME = Object.fromEntries(
  UNEXPLORED_MONSTER_POOLS.map((pool) => [pool.id, pool.name]),
) as Record<UnexploredPoolId, string>;

function printPerPlayer(
  players: readonly PreparedCandidate[],
  rows: readonly UnexploredRateRow[],
): void {
  console.log("\n[개인별 특성 적용 결과]");
  console.log("순위  난이도  전체    기본    최저 풀                 최고 풀");
  players.forEach((_, playerIndex) => {
    for (const difficulty of UNEXPLORED_SIMULATION_DIFFICULTIES) {
      const mechanicsRows = rows.filter(
        (row) =>
          row.playerIndex === playerIndex &&
          row.difficulty === difficulty &&
          row.mode === "mechanics",
      );
      const baseRows = rows.filter(
        (row) =>
          row.playerIndex === playerIndex &&
          row.difficulty === difficulty &&
          row.mode === "base",
      );
      const poolRates = poolRatesForPlayer(rows, playerIndex, difficulty).sort(
        (left, right) => left.ratePct - right.ratePct,
      );
      const hardest = poolRates[0];
      const easiest = poolRates.at(-1) ?? hardest;
      console.log(
        `${anonymousUnexploredRankLabel(playerIndex).padEnd(4)} ${String(difficulty).padStart(5)}   ${pct(rateOf(mechanicsRows)).padStart(6)}  ${pct(rateOf(baseRows)).padStart(6)}  ${`${POOL_NAME[hardest.poolId]} ${pct(hardest.ratePct)}`.padEnd(23)} ${POOL_NAME[easiest.poolId]} ${pct(easiest.ratePct)}`,
      );
    }
  });
}

function printPools(rows: readonly UnexploredRateRow[]): void {
  console.log("\n[특화 몬스터 풀별 결과]");
  console.log("난이도  풀                 능력치  특성적용  변화");
  for (const difficulty of UNEXPLORED_SIMULATION_DIFFICULTIES) {
    for (const pool of UNEXPLORED_MONSTER_POOLS) {
      const stats = rateOf(
        rows.filter(
          (row) =>
            row.difficulty === difficulty &&
            row.mode === "stats" &&
            row.poolId === pool.id,
        ),
      );
      const mechanics = rateOf(
        rows.filter(
          (row) =>
            row.difficulty === difficulty &&
            row.mode === "mechanics" &&
            row.poolId === pool.id,
        ),
      );
      console.log(
        `${String(difficulty).padStart(3)}     ${pool.name.padEnd(18)} ${pct(stats).padStart(7)}  ${pct(mechanics).padStart(8)}  ${(mechanics - stats).toFixed(1).padStart(6)}%p`,
      );
    }
  }
}

function printGroups(rows: readonly UnexploredRateRow[]): void {
  console.log("\n[직업·빌드별 특성 적용 결과]");
  for (const difficulty of UNEXPLORED_SIMULATION_DIFFICULTIES) {
    const mechanics = rows.filter(
      (row) => row.difficulty === difficulty && row.mode === "mechanics",
    );
    console.log(`난이도 ${difficulty} · 직업`);
    for (const group of groupUnexploredRates(mechanics, (row) => row.job)) {
      console.log(
        `  ${group.key} · ${group.summary.samplePlayers}명 · ${pct(group.summary.ratePct)} · 개인 중앙 ${pct(group.summary.medianPct)}`,
      );
    }
    console.log(`난이도 ${difficulty} · 빌드`);
    for (const group of groupUnexploredRates(
      mechanics,
      (row) => row.buildLabel,
    )) {
      console.log(
        `  ${group.key} · ${group.summary.samplePlayers}명 · ${pct(group.summary.ratePct)} · 개인 중앙 ${pct(group.summary.medianPct)}`,
      );
    }
  }
}

function printFlags(
  players: readonly PreparedCandidate[],
  rows: readonly UnexploredRateRow[],
): void {
  console.log("\n[자동 점검 플래그]");
  let flagCount = 0;
  for (const difficulty of UNEXPLORED_SIMULATION_DIFFICULTIES) {
    const mechanics = rows.filter(
      (row) => row.difficulty === difficulty && row.mode === "mechanics",
    );
    const stable = players.flatMap((_, playerIndex) => {
      const rate = rateOf(
        mechanics.filter((row) => row.playerIndex === playerIndex),
      );
      return rate >= 70
        ? [`${anonymousUnexploredRankLabel(playerIndex)} ${pct(rate)}`]
        : [];
    });
    if (stable.length > 0) {
      flagCount += 1;
      console.log(`- 난이도 ${difficulty} 안정 파밍 70%+: ${stable.join(", ")}`);
    }

    for (const pool of UNEXPLORED_MONSTER_POOLS) {
      const blocked = players.filter((_, playerIndex) => {
        const rate = rateOf(
          mechanics.filter(
            (row) =>
              row.playerIndex === playerIndex && row.poolId === pool.id,
          ),
        );
        return rate < 5;
      }).length;
      if (blocked / players.length >= 0.8) {
        flagCount += 1;
        console.log(
          `- 난이도 ${difficulty} 과도한 벽 후보: ${pool.name} · ${blocked}/${players.length}명이 5% 미만`,
        );
      }
    }

    const totalWins = mechanics.reduce((sum, row) => sum + row.wins, 0);
    if (totalWins > 0) {
      for (const [label, keyOf] of [
        ["직업", (row: UnexploredRateRow) => row.job],
        ["빌드", (row: UnexploredRateRow) => row.buildLabel],
      ] as const) {
        const groups = groupUnexploredRates(mechanics, keyOf);
        const largest = groups.sort(
          (left, right) => right.summary.wins - left.summary.wins,
        )[0];
        const share = (largest.summary.wins / totalWins) * 100;
        if (share >= 70) {
          flagCount += 1;
          console.log(
            `- 난이도 ${difficulty} 승리 ${label} 편중: ${largest.key} · ${pct(share)}`,
          );
        }
      }
    }
  }
  if (flagCount === 0) console.log("- 자동 기준에 걸린 항목 없음");
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new Pool({
    ...createDatabaseConnectionOptions(process.env.DATABASE_URL),
    max: 1,
    statement_timeout: 30_000,
  });
  try {
    const loaded = await loadTopPlayers(pool);
    if (loaded.players.length < TOP_COUNT) {
      throw new Error(
        `유효한 숙련도 상위 캐릭터가 ${loaded.players.length}명뿐입니다. ${TOP_COUNT}명이 필요합니다.`,
      );
    }
    console.log(
      `스냅샷 ${new Date().toISOString()} · 조회 ${loaded.scanned} · 제외 ${loaded.ineligible} · 손상 ${loaded.invalid} · 대상 ${loaded.players.length} · 몬스터당 ${TRIALS_PER_MONSTER}회 · seed ${SEED}`,
    );
    printTempoCalibration();
    printPlayers(loaded.players);
    const rows = simulateAll(loaded.players);
    printDifficultySummary(rows);
    printPerPlayer(loaded.players, rows);
    printPools(rows);
    printGroups(rows);
    printFlags(loaded.players, rows);
  } finally {
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
