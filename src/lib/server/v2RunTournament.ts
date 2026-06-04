import { and, eq, inArray } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { guildMembers, savesKv, v2GuildLineups } from "@/db/schema";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { resolveBattlePvP } from "@/adventure/v2/combat/engine-pvp";
import {
  simulateTournament,
  type MatchSim,
  type TournamentMember,
  type TournamentResult,
} from "@/adventure/data/v2/tournamentBattle";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

const MAX_LINEUP = 3;

// 길드의 라인업 후보 userId 목록 (라인업 row + 현 길드원 교집합).
// 라인업 미설정/모두 stale → 마스터 1명 fallback.
export async function fetchLineupCandidates(
  tx: Tx,
  guildId: number,
): Promise<string[]> {
  const members = await tx
    .select({ userId: guildMembers.userId, role: guildMembers.role })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, guildId));
  const memberIds = new Set(members.map((m) => m.userId));
  const masterId = members.find((m) => m.role === "master")?.userId;

  const lineupRow = await tx
    .select({ memberUserIds: v2GuildLineups.memberUserIds })
    .from(v2GuildLineups)
    .where(eq(v2GuildLineups.guildId, guildId))
    .limit(1);
  let candidateIds: string[];
  if (lineupRow[0] && lineupRow[0].memberUserIds.length > 0) {
    candidateIds = lineupRow[0].memberUserIds
      .filter((id) => memberIds.has(id))
      .slice(0, MAX_LINEUP);
  } else {
    candidateIds = [];
  }
  if (candidateIds.length === 0 && masterId) {
    candidateIds = [masterId];
  }
  return candidateIds;
}

// candidateIds 의 character.v2 가 이미 lock 된 상태에서 derive + name 채워서
// TournamentMember[] 반환. derive 실패한 멤버는 제외.
async function buildLineupMembersFromIds(
  tx: Tx,
  candidateIds: string[],
): Promise<TournamentMember[]> {
  if (candidateIds.length === 0) return [];
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
  const out: TournamentMember[] = [];
  for (const id of candidateIds) {
    const combat = await derivePlayerCombatV2(id, tx);
    if (!combat) continue;
    out.push({
      userId: id,
      name: nameByUser.get(id) ?? "모험가",
      player: { ...combat.player, hp: combat.maxHp },
    });
  }
  return out;
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
//
// lock 책임: caller (claim 라우트) 가 attackerIds/defenderIds 합집합을 사전
// 정렬 lock 한 뒤, 같은 ids 를 그대로 helper 에 넘긴다. helper 는 재조회 X —
// 잠긴 ids 로만 derive 해서 lock 범위 밖 멤버 read 차단.
//
// 라인업 멤버 derive 모두 실패한 측은 자동 패배 (attackerWon=상대측).
export async function runTournamentForGuilds(
  tx: Tx,
  attackerIds: string[],
  defenderIds: string[],
): Promise<RunTournamentOutput> {
  const [attackers, defenders] = await Promise.all([
    buildLineupMembersFromIds(tx, attackerIds),
    buildLineupMembersFromIds(tx, defenderIds),
  ]);
  const result = simulateTournament(attackers, defenders, pvpMatchSim);
  return {
    result,
    attackerLineupCount: attackers.length,
    defenderLineupCount: defenders.length,
  };
}
