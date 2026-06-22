import { and, desc, eq, gt, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  guildMembers,
  guilds,
  outpostClaimAttempts,
  outpostOccupations,
  outpostTreasury,
  savesKv,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { resolveUserDisplayName } from "@/lib/server/serverFeed";
import {
  currentFortHp,
  WAR_OVERVIEW_WINDOW_H,
} from "@/adventure/data/v2/outpostSiege";
import {
  isIntruderActive,
  parseLastHuntedOutpost,
} from "@/adventure/data/v2/intruderTracking";
import { OUTPOST_BY_ID } from "@/adventure/data/v2/outposts";
import { ACTIVE_CONTEST_OUTPOST_IDS } from "@/adventure/data/v2/warOutposts";
import { currentWarSeasonId } from "@/lib/server/war/season";
import { warSeasonGuildLeaderboard } from "@/lib/server/war/score";

// GET /api/v2/war/overview — 전황 스냅샷 (읽기 전용, 스키마 변경 0).
// 설계: docs/v2-war-visibility-plan.md PR-2. 전광판(피드)이 "사건 스트림"이라면
// 이쪽은 "상태"(성벽 진행도·내 길드 위협) — 전부 기존 테이블 파생.
//
// 응답:
//   sieges: 교전 중 거점 — 점령됐고 (성벽 < 최대 OR 최근 48h 공성 시도 존재).
//     각각 최근 공격 기록 몇 건(공격자/승패/시각) 동봉.
//   recentCaptures: 최근 48h 안에 점령/함락된 거점 (occupiedAt 파생 — 별도 컬럼 불요).
//   myGuild: 길드 소속 시 내 길드 점령 거점 상태(성벽·피습 여부·활성 침입자 수).
//
// 모든 read 는 비잠금 — 표시 전용 스냅샷이라 정합 race 허용.

const RECENT_ATTACKS_PER_OUTPOST = 5;
const TREASURE_LIST_LIMIT = 8;

type AttackEntry = {
  attackerName: string;
  attackerGuildName: string | null;
  won: boolean;
  at: string;
};

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const since = new Date(now.getTime() - WAR_OVERVIEW_WINDOW_H * 3_600_000);

  // 점령 전체 + 윈도 내 공성 로그 + 금고 — 세 테이블이 전황의 전부.
  const [occRowsAll, attackRowsAll, treasuryRowsAll] = await Promise.all([
    db.select().from(outpostOccupations),
    db
      .select()
      .from(outpostClaimAttempts)
      .where(gte(outpostClaimAttempts.createdAt, since))
      .orderBy(desc(outpostClaimAttempts.createdAt)),
    db
      .select({
        outpostId: outpostTreasury.outpostId,
        gold: outpostTreasury.gold,
      })
      .from(outpostTreasury)
      .where(gt(outpostTreasury.gold, 0)),
  ]);

  // 맵 축소(96→40) 후 컷된 거점에 남은 고아 점령/공성/금고 행은 전황에서 제외(inert 정리).
  // npc-attacks 크론도 미지 거점은 skip 하므로 고아 행은 어디서도 처리되지 않는 잔재일 뿐.
  const occRows = occRowsAll.filter((r) => OUTPOST_BY_ID.has(r.outpostId));
  const attackRows = attackRowsAll.filter((r) => OUTPOST_BY_ID.has(r.outpostId));
  const treasuryRows = treasuryRowsAll.filter((r) =>
    OUTPOST_BY_ID.has(r.outpostId),
  );

  // 길드 이름 일괄 해석 — 점령 길드 + 공격측 길드 (N+1 회피).
  const guildIds = [
    ...new Set(
      [
        ...occRows.map((r) => r.occupiedByGuildId),
        ...attackRows.map((r) => r.attackerGuildId),
      ].filter((id): id is number => id != null),
    ),
  ];
  const guildNameById = new Map<number, string>();
  if (guildIds.length > 0) {
    const gs = await db
      .select({ id: guilds.id, name: guilds.name })
      .from(guilds)
      .where(inArray(guilds.id, guildIds));
    for (const g of gs) guildNameById.set(g.id, g.name);
  }

  // 유저 표시명 일괄 해석 — 솔로 점령자 + 솔로 공격자. 윈도가 짧아 유니크 수가 작다.
  const soloUserIds = new Set<string>();
  for (const r of occRows) {
    if (r.occupiedByUserId && r.occupiedByGuildId == null) {
      soloUserIds.add(r.occupiedByUserId);
    }
  }
  for (const r of attackRows) {
    if (r.attackerUserId && r.attackerGuildId == null) {
      soloUserIds.add(r.attackerUserId);
    }
  }
  const nameByUserId = new Map<string, string>();
  for (const id of soloUserIds) {
    nameByUserId.set(id, await resolveUserDisplayName(id));
  }

  // 점령자 라벨 — 길드명 우선, 솔로면 닉네임.
  const ownerLabelOf = (r: (typeof occRows)[number]): string =>
    r.occupiedByGuildId != null
      ? `${guildNameById.get(r.occupiedByGuildId) ?? "알 수 없는"} 길드`
      : (nameByUserId.get(r.occupiedByUserId ?? "") ?? "솔로 점령자");

  const attacksByOutpost = new Map<string, AttackEntry[]>();
  const attackedOutpostIds = new Set<string>();
  for (const a of attackRows) {
    attackedOutpostIds.add(a.outpostId);
    const list = attacksByOutpost.get(a.outpostId) ?? [];
    if (list.length < RECENT_ATTACKS_PER_OUTPOST) {
      list.push({
        // NPC 정기 공격(attackerUserId null)은 수비자 시점 기록 — 공격자명 "NPC 수비대".
        attackerName: a.attackerUserId
          ? a.attackerGuildId != null
            ? (guildNameById.get(a.attackerGuildId) ?? "알 수 없는") + " 길드"
            : (nameByUserId.get(a.attackerUserId) ?? "모험가")
          : "NPC",
        attackerGuildName:
          a.attackerGuildId != null
            ? (guildNameById.get(a.attackerGuildId) ?? null)
            : null,
        won: a.won,
        at: a.createdAt.toISOString(),
      });
    }
    attacksByOutpost.set(a.outpostId, list);
  }

  // 교전 중 = 점령됐고 (재생 반영 성벽 < 최대 OR 윈도 내 공성 시도 있음).
  const occupied = occRows.filter((r) => r.occupiedByUserId != null);
  const sieges = occupied
    .map((r) => ({
      row: r,
      fortHp: currentFortHp(r.fortHp, r.fortMaxHp, r.fortUpdatedAt, now),
    }))
    .filter(
      ({ row, fortHp }) =>
        fortHp < row.fortMaxHp || attackedOutpostIds.has(row.outpostId),
    )
    .map(({ row, fortHp }) => ({
      outpostId: row.outpostId,
      ownerLabel: ownerLabelOf(row),
      fortHp,
      fortMaxHp: row.fortMaxHp,
      protectedUntil: row.protectedUntil.toISOString(),
      recentAttacks: attacksByOutpost.get(row.outpostId) ?? [],
    }))
    // 성벽이 많이 깎인(함락 임박) 순.
    .sort((a, b) => a.fortHp / a.fortMaxHp - b.fortHp / b.fortMaxHp);

  // 최근 점령/함락 — occupiedAt 이 윈도 안. (함락도 소유권 이전 = occupiedAt 갱신.)
  const recentCaptures = occupied
    .filter((r) => r.occupiedAt.getTime() >= since.getTime())
    .sort((a, b) => b.occupiedAt.getTime() - a.occupiedAt.getTime())
    .map((r) => ({
      outpostId: r.outpostId,
      ownerLabel: ownerLabelOf(r),
      at: r.occupiedAt.toISOString(),
    }));

  // 내 길드 거점 — 소속 없으면 null. getGuildId 는 tx 시그니처라 직접 select.
  const [membership] = await db
    .select({ guildId: guildMembers.guildId })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  let myGuild: {
    guildId: number;
    outposts: Array<{
      outpostId: string;
      fortHp: number;
      fortMaxHp: number;
      underAttack: boolean;
      intruderCount: number;
    }>;
  } | null = null;
  if (membership) {
    const mine = occupied.filter(
      (r) => r.occupiedByGuildId === membership.guildId,
    );
    // 활성 침입자 수 — intruders GET 과 같은 JSON path 후보 조회를 내 거점 묶음에
    // 한 번만. (목록이 아니라 카운트만 — 상세는 거점 화면 IntruderPanel.)
    const intruderCountByOutpost = new Map<string, number>();
    if (mine.length > 0) {
      const ids = mine.map((r) => r.outpostId);
      const candidateRows = await db
        .select({ userId: savesKv.userId, value: savesKv.value })
        .from(savesKv)
        .where(
          and(
            eq(savesKv.key, "character.v2"),
            inArray(
              sql`${savesKv.value} -> 'lastHuntedOutpost' ->> 'outpostId'`,
              ids,
            ),
          ),
        );
      const ownGuildRows = await db
        .select({ userId: guildMembers.userId })
        .from(guildMembers)
        .where(eq(guildMembers.guildId, membership.guildId));
      const ownIds = new Set(ownGuildRows.map((r) => r.userId));
      const nowMs = now.getTime();
      for (const row of candidateRows) {
        if (ownIds.has(row.userId)) continue;
        const last = parseLastHuntedOutpost(
          (row.value as { lastHuntedOutpost?: unknown } | null)
            ?.lastHuntedOutpost,
        );
        if (!last) continue;
        if (!isIntruderActive(last, last.outpostId, nowMs)) continue;
        intruderCountByOutpost.set(
          last.outpostId,
          (intruderCountByOutpost.get(last.outpostId) ?? 0) + 1,
        );
      }
    }
    myGuild = {
      guildId: membership.guildId,
      outposts: mine
        .map((r) => {
          const fortHp = currentFortHp(
            r.fortHp,
            r.fortMaxHp,
            r.fortUpdatedAt,
            now,
          );
          return {
            outpostId: r.outpostId,
            fortHp,
            fortMaxHp: r.fortMaxHp,
            underAttack:
              fortHp < r.fortMaxHp || attackedOutpostIds.has(r.outpostId),
            intruderCount: intruderCountByOutpost.get(r.outpostId) ?? 0,
          };
        })
        // 위협(피습) 거점 상단.
        .sort(
          (a, b) =>
            Number(b.underAttack) - Number(a.underAttack) ||
            a.fortHp / a.fortMaxHp - b.fortHp / b.fortMaxHp,
        ),
    };
  }

  // 노다지 거점 — 금고 쌓인 미점령 거점, 금액 desc 상위. 점령(자동 회수) 유인.
  const occupiedIds = new Set(occupied.map((r) => r.outpostId));
  const treasures = treasuryRows
    .filter((t) => !occupiedIds.has(t.outpostId))
    .sort((a, b) => b.gold - a.gold)
    .slice(0, TREASURE_LIST_LIMIT);

  // 이번 주 활성 쟁탈 거점(전장) — 점수 집계 + 주간 리셋 대상. 일반 점령과 구분해 UI 가
  // "이번 주 전장"만 강조하도록. occRow 없으면 중립(NPC) = 첫 점령 가능 상태.
  const occByOutpostId = new Map(occRows.map((r) => [r.outpostId, r] as const));
  const activeOutposts = ACTIVE_CONTEST_OUTPOST_IDS.map((id) => {
    const r = occByOutpostId.get(id);
    const o = OUTPOST_BY_ID.get(id);
    return {
      outpostId: id,
      name: o?.name ?? id,
      tier: o?.tier ?? 0,
      ownerLabel: r && r.occupiedByUserId != null ? ownerLabelOf(r) : null,
      ownerGuildId: r?.occupiedByGuildId ?? null,
      fortHp: r ? currentFortHp(r.fortHp, r.fortMaxHp, r.fortUpdatedAt, now) : null,
      fortMaxHp: r?.fortMaxHp ?? null,
    };
  });

  // 시즌 길드 랭킹 — 점수 원장 read-time SUM. 길드명 보강(현재 미점령이어도 점수 있을 수 있음).
  const seasonId = currentWarSeasonId(now);
  const lb = await warSeasonGuildLeaderboard(seasonId);
  const missingGuildIds = lb
    .map((e) => e.guildId)
    .filter((id) => !guildNameById.has(id));
  if (missingGuildIds.length > 0) {
    const gs = await db
      .select({ id: guilds.id, name: guilds.name })
      .from(guilds)
      .where(inArray(guilds.id, missingGuildIds));
    for (const g of gs) guildNameById.set(g.id, g.name);
  }
  const leaderboard = lb.map((e) => ({
    guildId: e.guildId,
    guildName: guildNameById.get(e.guildId) ?? "알 수 없는 길드",
    points: Number(e.points),
  }));

  return Response.json({
    ok: true,
    sieges,
    recentCaptures,
    treasures,
    myGuild,
    activeOutposts,
    season: { id: seasonId, leaderboard },
  });
}
