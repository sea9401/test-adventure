import { and, eq, inArray } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { guildMembers, savesKv, v2GuildLineups } from "@/db/schema";
import { derivePlayerCombatFromSaves } from "@/lib/server/derivePlayerCombatFromSaves";
import { lockSaveForUpdate } from "@/lib/server/savesKv";
import { resolveBattlePvP } from "@/adventure/battle/engine-pvp";
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
async function fetchLineupCandidates(
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
    const combat = await derivePlayerCombatFromSaves(id, tx);
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
// lock 정책: 양측 라인업 모든 멤버의 character.v2 를 사전 정렬 후 FOR UPDATE.
// 동시에 그 멤버들의 character.v2 가 mutate (사냥/claim 등) 되어 stale sim
// 결과 나오는 것 방지. 사전 정렬 — 토너먼트 동시 시도 시 같은 순서.
//
// ⚠ TODO PR-vi-a-2: claim 라우트가 attacker character.v2 를 (3) 단계에서
// 사전 정렬 외 별도로 잠금. attacker userId 가 라인업에 있으면 사전 정렬 안에서
// 다시 시도되어 같은 row no-op 이지만, cross-tx 에서 양측 attacker 가 서로의
// 라인업에 포함되면 (3) 단독 잠금과 (5) 사전 정렬 순서가 어긋나 데드락 가능.
// 완전 fix 는 claim 의 attacker char.v2 lock 을 사전 정렬 안으로 통합 필요.
// 현 PR 은 stale sim 만 차단 — staging 멀티유저 검증 후 vi-a-2 진행.
//
// 라인업 멤버 derive 모두 실패한 측은 자동 패배 (attackerWon=상대측).
export async function runTournamentForGuilds(
  tx: Tx,
  attackerGuildId: number,
  defenderGuildId: number,
): Promise<RunTournamentOutput> {
  const [attackerIds, defenderIds] = await Promise.all([
    fetchLineupCandidates(tx, attackerGuildId),
    fetchLineupCandidates(tx, defenderGuildId),
  ]);

  // 양측 합쳐 unique + 사전 정렬 → 차례로 character.v2 lock.
  const allIds = Array.from(new Set([...attackerIds, ...defenderIds])).sort();
  for (const id of allIds) {
    await lockSaveForUpdate<unknown>(tx, id, "character.v2", {});
  }

  // 잠금 후 derive — 다른 tx 의 mutation 차단된 상태에서 stat 읽음.
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
