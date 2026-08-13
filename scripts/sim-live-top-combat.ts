// 운영 전투력 상위 캐릭터의 일반 사냥 승률을 실제 저장 스냅샷으로 점검한다.
// 읽기 전용: users/saves_kv를 SELECT만 하며 게임 데이터는 변경하지 않는다.
// 운영 EC2 실행: node --env-file=/run/adventure-rpg/production.env --env-file=.env.production --import tsx scripts/sim-live-top-combat.ts

import { Pool } from "pg";
import { pathToFileURL } from "node:url";
import { createDatabaseConnectionOptions } from "../src/db/databaseTls.mjs";
import {
  derivePlayerCombatV2FromSaves,
  type SavedCharacterV2,
} from "../src/lib/server/derivePlayerCombatV2";
import { derivePowerScore } from "../src/adventure/data/v2/power";
import { powerInputFromPlayer } from "../src/lib/server/playerPowerInput";
import {
  parseV2SkillsState,
  type V2SkillsState,
} from "../src/adventure/data/v2/v2Skills";
import { sanitizeCombatLoadout } from "../src/lib/server/v2Skills";
import { codexSpBonusFromRaw } from "../src/lib/server/codexSpBonus";
import { jobUnlockContextFromSaves } from "../src/lib/server/jobUnlockContext";
import { parseClaimed } from "../src/lib/server/v2QuestContext";
import {
  enemiesForDepth,
  huntStageName,
  MAX_FRONTIER_DEPTH,
  nextHuntStageDepth,
} from "../src/adventure/data/v2/dungeon";
import { V2_MONSTERS } from "../src/adventure/data/v2/v2Monsters";
import { scaleMonsterForFloor } from "../src/adventure/data/v2/monsterScale";
import { resolveBattle } from "../src/adventure/v2/combat/engine";
import { pickAutoAction } from "../src/adventure/v2/combat/pickAutoAction";
import { jobDisplayName, parseV2Class } from "../src/adventure/data/v2/classes";
import { superAdminEmails } from "../src/lib/server/adminEmailAccess";
import {
  stormExpeditionEnemy,
  type StormExpeditionEncounterKind,
  type StormExpeditionRouteId,
} from "../src/adventure/data/v2/stormExpedition";
import {
  LIMITED_RECOVERY_SKILL_IDS,
  type LimitedRecoverySkillId,
} from "../src/adventure/data/v2/v2Skills";
import {
  COOP_BOSSES,
  COOP_BOSS_KIND_IDS,
  type CoopBossKindId,
} from "../src/adventure/data/v2/coopBosses";
import { auditCoopBossForPlayer } from "./sim-v2-coop-boss";

const TOP_COUNT = 20;
const TRIALS_PER_ENEMY = 20;
const STORM_TRIALS_PER_ROUTE = 100;
const COOP_TRIALS_PER_BOSS = 20;
const SEED = 20260807;
const STORM_ONLY = process.argv.includes("--storm-only");
const COOP_ONLY = process.argv.includes("--coop-only");
const DEPTHS = Array.from(
  { length: MAX_FRONTIER_DEPTH / 2 },
  (_, index) => (index + 1) * 2,
);

const SAVE_KEYS = [
  "character.v2",
  "character-profile.v2",
  "equipment.v2",
  "proficiency.v2",
  "skills.v2",
  "fishing-codex.v1",
  "equipment-codex.v1",
  "farm.v2",
  "cooking.v1",
  "woodcutting-log.v1",
  "mining-log.v1",
  "guide-quests.v2",
] as const;

type SaveMap = Record<string, unknown>;
type DbRow = {
  user_id: string;
  email: string | null;
  game_name: string | null;
  saves: SaveMap | null;
};

type Candidate = {
  userId: string;
  saves: SaveMap;
  character: SavedCharacterV2 & {
    frontierDepth?: unknown;
    specChoice?: unknown;
  };
  rankingPower: number;
};

type SimPlayer = Candidate & {
  combat: NonNullable<ReturnType<typeof derivePlayerCombatV2FromSaves>>;
  skills: V2SkillsState;
  job: string;
  frontierDepth: number;
};

type Rate = { wins: number; total: number };

export type LiveCoopAuditRow = {
  bossId: CoopBossKindId;
  survived: boolean;
  contributionRatio: number;
};

export type LiveCoopAuditSummary = {
  bossId: CoopBossKindId;
  survivalRatePct: number;
  minContributionRatio: number;
  medianContributionRatio: number;
  p95ContributionRatio: number;
};

function powerOf(
  combat: NonNullable<ReturnType<typeof derivePlayerCombatV2FromSaves>>,
): number {
  return derivePowerScore(
    powerInputFromPlayer(
      combat.player,
      combat.maxHp,
      combat.player.maxMp,
    ),
  );
}

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

function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

export function summarizeLiveCoopAudits(
  rows: readonly LiveCoopAuditRow[],
): LiveCoopAuditSummary[] {
  return COOP_BOSS_KIND_IDS.flatMap((bossId) => {
    const bossRows = rows.filter((row) => row.bossId === bossId);
    if (bossRows.length === 0) return [];
    const contributions = bossRows.map((row) => row.contributionRatio);
    return [
      {
        bossId,
        survivalRatePct:
          (bossRows.filter((row) => row.survived).length / bossRows.length) *
          100,
        minContributionRatio: percentile(contributions, 0),
        medianContributionRatio: percentile(contributions, 0.5),
        p95ContributionRatio: percentile(contributions, 0.95),
      },
    ];
  });
}

function pct(rate: Rate): number {
  return rate.total > 0 ? (rate.wins / rate.total) * 100 : 0;
}

function simulateDepth(player: SimPlayer, depth: number): Rate {
  let wins = 0;
  let total = 0;
  for (const entry of enemiesForDepth(depth)) {
    const base = V2_MONSTERS[entry.key];
    if (!base) continue;
    const scaled = scaleMonsterForFloor(base, depth, true);
    const monsterSkills = [entry.statusSkill, entry.castSkill].filter(
      (skill): skill is NonNullable<typeof skill> => skill != null,
    );
    const enemy = {
      ...scaled,
      name: entry.name,
      image: entry.image ?? base.image,
      element: "neutral" as const,
      ...(monsterSkills.length > 0
        ? { v2Skills: { learned: monsterSkills, equipped: monsterSkills } }
        : {}),
    };
    for (let trial = 0; trial < TRIALS_PER_ENEMY; trial += 1) {
      const result = resolveBattle(
        {
          ...player.combat.player,
          hp: player.combat.maxHp,
          mp: player.combat.player.maxMp ?? player.combat.player.mp ?? 0,
        },
        enemy,
        "시뮬레이션 모험가",
        {
          pickAction: (state) =>
            pickAutoAction(state, { rules: [], potions: {} }),
          potions: {},
          v2Skills: player.skills,
          depth,
        },
      );
      total += 1;
      if (result.outcome === "win") wins += 1;
    }
  }
  return { wins, total };
}

const STORM_ENCOUNTERS: ReadonlyArray<{
  kind: StormExpeditionEncounterKind;
  encounterIndex: number;
}> = [
  { kind: "early_trash", encounterIndex: 0 },
  { kind: "early_trash", encounterIndex: 1 },
  { kind: "late_trash", encounterIndex: 0 },
  { kind: "late_trash", encounterIndex: 1 },
  { kind: "elite", encounterIndex: 0 },
  { kind: "guardian", encounterIndex: 0 },
  { kind: "final_boss", encounterIndex: 0 },
];

type StormRate = {
  cleared: number[];
  runs: number;
};

function simulateStormRoute(
  player: SimPlayer,
  route: StormExpeditionRouteId,
): StormRate {
  const cleared = STORM_ENCOUNTERS.map(() => 0);
  const base = player.combat.player;
  const maxHp = player.combat.maxHp;
  const maxMp = base.maxMp ?? 0;
  for (let run = 0; run < STORM_TRIALS_PER_ROUTE; run += 1) {
    let hp = maxHp;
    let mp = maxMp;
    let guarded = false;
    const usedRecoverySkillIds = new Set<LimitedRecoverySkillId>();
    for (let index = 0; index < STORM_ENCOUNTERS.length; index += 1) {
      const encounter = STORM_ENCOUNTERS[index];
      const result = resolveBattle(
        {
          ...base,
          hp,
          mp,
          ...(guarded
            ? {
                passiveDamageTakenReductionPct:
                  (base.passiveDamageTakenReductionPct ?? 0) + 10,
              }
            : {}),
        },
        stormExpeditionEnemy(route, encounter.kind, encounter.encounterIndex),
        "시뮬레이션 모험가",
        {
          pickAction: (state) =>
            pickAutoAction(state, { rules: [], potions: {} }),
          potions: {},
          v2Skills: usedRecoverySkillIds.size > 0
            ? {
                ...player.skills,
                equipped: player.skills.equipped.filter(
                  (skillId) =>
                    !usedRecoverySkillIds.has(skillId as LimitedRecoverySkillId),
                ),
              }
            : player.skills,
          maxTurns: 100,
          isBoss:
            encounter.kind === "guardian" || encounter.kind === "final_boss",
        },
      );
      if (result.outcome !== "win") break;
      cleared[index] += 1;
      hp = result.finalState.playerHp;
      mp = result.finalState.playerMp;
      for (const skillId of LIMITED_RECOVERY_SKILL_IDS) {
        if ((result.finalState.v2SkillCooldowns[skillId] ?? 0) > 0) {
          usedRecoverySkillIds.add(skillId);
        }
      }

      if (index === 1) {
        const hpRatio = hp / maxHp;
        const mpRatio = mp / Math.max(1, maxMp);
        if ((base.passiveMagicBasicAttack && hpRatio < 0.9) || hpRatio <= mpRatio) {
          hp = Math.min(maxHp, hp + Math.floor(maxHp * 0.15));
        } else {
          mp = Math.min(maxMp, mp + Math.floor(maxMp * 0.2));
        }
      }
      if (index === 3) {
        const hpRatio = hp / maxHp;
        const mpRatio = mp / Math.max(1, maxMp);
        const balancedMagicRecovery = Boolean(
          base.passiveMagicBasicAttack && hpRatio >= 0.25 && mpRatio < 0.2,
        );
        if (balancedMagicRecovery) {
          hp = Math.min(maxHp, hp + Math.floor(maxHp * 0.2));
          mp = Math.min(maxMp, mp + Math.floor(maxMp * 0.25));
        } else if (hpRatio < 0.7 || hpRatio + 0.15 < mpRatio) {
          hp = Math.min(maxHp, hp + Math.floor(maxHp * 0.35));
        } else if (mpRatio + 0.15 < hpRatio) {
          mp = Math.min(maxMp, mp + Math.floor(maxMp * 0.45));
        } else {
          hp = Math.min(maxHp, hp + Math.floor(maxHp * 0.2));
          mp = Math.min(maxMp, mp + Math.floor(maxMp * 0.25));
        }
      }
      if (index === 4) guarded = true;
      if (index === 5) {
        const hpRatio = hp / maxHp;
        const mpRatio = mp / Math.max(1, maxMp);
        if (hpRatio <= mpRatio) {
          hp = Math.min(maxHp, hp + Math.floor(maxHp * 0.25));
        } else {
          mp = Math.min(maxMp, mp + Math.floor(maxMp * 0.35));
        }
      }
    }
  }
  return { cleared, runs: STORM_TRIALS_PER_ROUTE };
}

function printStormResults(players: SimPlayer[]): void {
  console.log(
    `운영 전투력 상위 ${players.length}명 · 폭풍 원정 ${STORM_TRIALS_PER_ROUTE}회/인/항로 · 위험 이벤트·충전약 없음`,
  );
  for (const route of ["gale", "thunder", "wreckage"] as const) {
    const rates = players.map((player) => simulateStormRoute(player, route));
    const totals = STORM_ENCOUNTERS.map((_, index) =>
      rates.reduce((sum, rate) => sum + rate.cleared[index], 0),
    );
    const totalRuns = rates.reduce((sum, rate) => sum + rate.runs, 0);
    const individualClears = rates.map((rate) =>
      ((rate.cleared.at(-1) ?? 0) / rate.runs) * 100,
    );
    const percentage = (index: number) =>
      ((totals[index] / totalRuns) * 100).toFixed(1);
    console.log(
      `${route.padEnd(8)} 외곽 ${percentage(1)}% · 중층 ${percentage(3)}% · 정예 ${percentage(4)}% · 수호자 ${percentage(5)}% · 완주 ${percentage(6)}% · 개인 완주 최소/중앙/최대 ${percentile(individualClears, 0).toFixed(0)}/${percentile(individualClears, 0.5).toFixed(0)}/${percentile(individualClears, 1).toFixed(0)}%`,
    );
  }
}

function printCoopResults(players: SimPlayer[]): void {
  const rows: LiveCoopAuditRow[] = [];
  players.forEach((player, playerIndex) => {
    for (const bossId of COOP_BOSS_KIND_IDS) {
      const trials = auditCoopBossForPlayer({
        bossId,
        player: player.combat.player,
        skills: player.skills,
        trials: COOP_TRIALS_PER_BOSS,
        seed: SEED + playerIndex * 10_000,
      });
      rows.push(
        ...trials.map((trial) => ({
          bossId,
          survived: trial.survived,
          contributionRatio: trial.contributionRatio,
        })),
      );
    }
  });

  console.log(
    `운영 전투력 상위 ${players.length}명 · 협동 보스 ${COOP_TRIALS_PER_BOSS}회/인/보스 · 식별 정보 제외`,
  );
  console.log("보스                         생존율  기여율 최소/중앙/p95");
  for (const summary of summarizeLiveCoopAudits(rows)) {
    const label = `${summary.bossId} (${COOP_BOSSES[summary.bossId].name})`;
    console.log(
      `${label.padEnd(29)} ${summary.survivalRatePct.toFixed(1).padStart(5)}%  ${(summary.minContributionRatio * 100).toFixed(2).padStart(5)}/${(summary.medianContributionRatio * 100).toFixed(2).padStart(5)}/${(summary.p95ContributionRatio * 100).toFixed(2).padStart(5)}%`,
    );
  }
}

function preparePlayer(candidate: Candidate): SimPlayer | null {
  const { saves, character } = candidate;
  const storedSkills = parseV2SkillsState(saves["skills.v2"]);
  const codexBonus = codexSpBonusFromRaw(
    saves["fishing-codex.v1"],
    saves["equipment-codex.v1"],
  );
  const unlockContext = jobUnlockContextFromSaves({
    farmRaw: saves["farm.v2"],
    cookingRaw: saves["cooking.v1"],
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
  const spec =
    typeof character.specChoice === "string" ? character.specChoice : null;
  return {
    ...candidate,
    combat,
    skills,
    job: jobDisplayName(parseV2Class(character.class), spec),
    frontierDepth: Math.min(
      MAX_FRONTIER_DEPTH,
      Math.max(2, Math.floor(Number(character.frontierDepth) || 2)),
    ),
  };
}

async function loadTopPlayers(pool: Pool): Promise<SimPlayer[]> {
  const result = await pool.query<DbRow>(
    `
      SELECT
        u.id AS user_id,
        u.email,
        u.game_name,
        COALESCE(
          jsonb_object_agg(s.key, s.value) FILTER (WHERE s.key IS NOT NULL),
          '{}'::jsonb
        ) AS saves
      FROM users u
      LEFT JOIN saves_kv s
        ON s.user_id = u.id
       AND s.key = ANY($1::text[])
      GROUP BY u.id, u.email, u.game_name
    `,
    [SAVE_KEYS],
  );
  const admins = superAdminEmails();
  const candidates: Candidate[] = [];
  for (const row of result.rows) {
    if (row.email && admins.has(row.email.toLowerCase())) continue;
    const saves = row.saves ?? {};
    const character = saves["character.v2"] as Candidate["character"] | undefined;
    if (!character) continue;
    const rankingCombat = derivePlayerCombatV2FromSaves({
      character,
      equipmentSave: saves["equipment.v2"],
      proficiencyRaw: saves["proficiency.v2"],
      skillsRaw: saves["skills.v2"],
      includeCookingBuff: false,
    });
    if (!rankingCombat) continue;
    candidates.push({
      userId: row.user_id,
      saves,
      character,
      rankingPower: powerOf(rankingCombat),
    });
  }
  return candidates
    .sort(
      (left, right) =>
        right.rankingPower - left.rankingPower ||
        left.userId.localeCompare(right.userId),
    )
    .slice(0, TOP_COUNT)
    .map(preparePlayer)
    .filter((player): player is SimPlayer => player != null);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new Pool({
    ...createDatabaseConnectionOptions(process.env.DATABASE_URL),
    max: 1,
    statement_timeout: 30_000,
  });
  try {
    const players = await loadTopPlayers(pool);
    if (players.length === 0) throw new Error("시뮬레이션할 캐릭터가 없습니다.");

    if (COOP_ONLY) {
      printCoopResults(players);
      return;
    }

    const originalRandom = Math.random;
    Math.random = seededRandom(SEED);
    if (STORM_ONLY) {
      try {
        printStormResults(players);
      } finally {
        Math.random = originalRandom;
      }
      return;
    }
    const matrix = new Map<number, Rate[]>();
    try {
      for (const depth of DEPTHS) {
        matrix.set(
          depth,
          players.map((player) => simulateDepth(player, depth)),
        );
      }
    } finally {
      Math.random = originalRandom;
    }

    console.log(
      `운영 전투력 상위 ${players.length}명 · 일반 사냥 전투력 미달 보정 없음 · 몬스터당 ${TRIALS_PER_ENEMY}회 · seed ${SEED}`,
    );
    console.log("랭크  전투력  직업              도달  HP     ATK  MATK  DEF  SPD");
    players.forEach((player, index) => {
      const combat = player.combat.player;
      console.log(
        `${String(index + 1).padStart(2)}  ${String(player.rankingPower).padStart(6)}  ${player.job.slice(0, 14).padEnd(16)}  ${String(player.frontierDepth).padStart(2)}  ${String(player.combat.maxHp).padStart(5)}  ${String(combat.atk).padStart(4)}  ${String(combat.magicAtk ?? 0).padStart(4)}  ${String(combat.def).padStart(3)}  ${String(combat.spd).padStart(3)}`,
      );
    });

    console.log("\n단계                       도전가능  전체승률  도전가능승률  개인승률 최소/중앙/최대");
    for (const depth of DEPTHS) {
      const rates = matrix.get(depth) ?? [];
      const all = rates.reduce<Rate>(
        (sum, rate) => ({ wins: sum.wins + rate.wins, total: sum.total + rate.total }),
        { wins: 0, total: 0 },
      );
      const eligibleIndexes = players.flatMap((player, index) => {
        const next = nextHuntStageDepth(player.frontierDepth);
        return depth <= player.frontierDepth || depth === next ? [index] : [];
      });
      const eligible = eligibleIndexes.reduce<Rate>(
        (sum, index) => ({
          wins: sum.wins + (rates[index]?.wins ?? 0),
          total: sum.total + (rates[index]?.total ?? 0),
        }),
        { wins: 0, total: 0 },
      );
      const individualRates = rates.map(pct);
      console.log(
        `${`${String(depth).padStart(2)} ${huntStageName(depth)}`.padEnd(28)} ${String(eligibleIndexes.length).padStart(2)}/${players.length}      ${pct(all).toFixed(1).padStart(5)}%       ${eligible.total > 0 ? pct(eligible).toFixed(1).padStart(5) : "    -"}%       ${percentile(individualRates, 0).toFixed(0).padStart(3)}/${percentile(individualRates, 0.5).toFixed(0).padStart(3)}/${percentile(individualRates, 1).toFixed(0).padStart(3)}%`,
      );
    }

    console.log("\n각 유저의 현재 다음 도전 단계 승률");
    players.forEach((player, index) => {
      const depth = nextHuntStageDepth(player.frontierDepth) ?? player.frontierDepth;
      const rate = matrix.get(depth)?.[index] ?? { wins: 0, total: 0 };
      console.log(
        `${String(index + 1).padStart(2)}위 · ${player.job} · 전투력 ${player.rankingPower} · ${huntStageName(depth)}(${depth}) · ${pct(rate).toFixed(1)}%`,
      );
    });
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
