import { and, eq, inArray } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { guildMembers, savesKv, v2GuildLineups } from "@/db/schema";
import { derivePlayerCombatFromSaves } from "@/lib/server/derivePlayerCombatFromSaves";
import { resolveBattlePvP } from "@/adventure/battle/engine-pvp";
import {
  simulateTournament,
  type MatchSim,
  type TournamentMember,
  type TournamentResult,
} from "@/adventure/data/v2/tournamentBattle";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

const MAX_LINEUP = 3;

// 길드의 토너먼트 라인업 → derive 된 TournamentMember[] 변환.
// 라인업 미설정/멤버 derive 실패 → 마스터 1명 fallback.
// stale (라인업 멤버가 더이상 길드원 아님) 인 경우 필터.
async function buildLineupMembers(
  tx: Tx,
  guildId: number,
): Promise<TournamentMember[]> {
  // 현 길드 멤버 + 마스터 식별.
  const members = await tx
    .select({ userId: guildMembers.userId, role: guildMembers.role })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, guildId));
  const memberIds = new Set(members.map((m) => m.userId));
  const masterId = members.find((m) => m.role === "master")?.userId;

  // 라인업 row 조회.
  const lineupRow = await tx
    .select({ memberUserIds: v2GuildLineups.memberUserIds })
    .from(v2GuildLineups)
    .where(eq(v2GuildLineups.guildId, guildId))
    .limit(1);
  let candidateIds: string[];
  if (lineupRow[0] && lineupRow[0].memberUserIds.length > 0) {
    // stale 필터 — 현 길드원만.
    candidateIds = lineupRow[0].memberUserIds
      .filter((id) => memberIds.has(id))
      .slice(0, MAX_LINEUP);
  } else {
    candidateIds = [];
  }
  // 라인업 비어있거나 모두 stale → 마스터 1명 fallback.
  if (candidateIds.length === 0 && masterId) {
    candidateIds = [masterId];
  }

  // 각 멤버의 PlayerCombat derive + 이름.
  // derive 실패하면 그 멤버는 라인업에서 제외 (캐릭 없음).
  if (candidateIds.length === 0) return [];

  // 이름 fetch — 한번에.
  const profileRows = await tx
    .select({ userId: savesKv.userId, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        inArray(savesKv.userId, candidateIds),
        eq(savesKv.key, "character-profile.v2"),
      ),
    );
  const nameByUser = new Map<string, string>();
  for (const row of profileRows) {
    const profile = (row.value ?? null) as { name?: string } | null;
    const name = profile?.name?.trim() || "모험가";
    nameByUser.set(row.userId, name);
  }

  const members_out: TournamentMember[] = [];
  for (const id of candidateIds) {
    const combat = await derivePlayerCombatFromSaves(id, tx);
    if (!combat) continue;
    // PvP sim 은 입력 hp 그대로 시작 hp 로 — 만피로 시작.
    members_out.push({
      userId: id,
      name: nameByUser.get(id) ?? "모험가",
      player: { ...combat.player, hp: combat.maxHp },
    });
  }
  return members_out;
}

// resolveBattlePvP 를 토너먼트 MatchSim 으로 래핑.
const pvpMatchSim: MatchSim = (a, d) => {
  const result = resolveBattlePvP(a.player, d.player, a.name, d.name, {
    pickAction: () => ({ kind: "attack" }),
    potions: { p1: {}, p2: {} },
  });
  return {
    attackerName: a.name,
    defenderName: d.name,
    winnerSide: result.outcome === "p1_win" ? "attacker" : "defender",
    turns: result.turns,
    attackerHpEnd: Math.max(0, result.finalState.p1.hp),
    defenderHpEnd: Math.max(0, result.finalState.p2.hp),
  };
};

export type RunTournamentOutput = {
  result: TournamentResult;
  attackerLineupCount: number;
  defenderLineupCount: number;
};

// 양측 길드의 토너먼트 sim 단판 실행. claim 라우트에서 호출.
// 라인업 멤버 derive 모두 실패한 측은 자동 패배 (attackerWon=상대측).
export async function runTournamentForGuilds(
  tx: Tx,
  attackerGuildId: number,
  defenderGuildId: number,
): Promise<RunTournamentOutput> {
  const [attackers, defenders] = await Promise.all([
    buildLineupMembers(tx, attackerGuildId),
    buildLineupMembers(tx, defenderGuildId),
  ]);
  const result = simulateTournament(attackers, defenders, pvpMatchSim);
  return {
    result,
    attackerLineupCount: attackers.length,
    defenderLineupCount: defenders.length,
  };
}
