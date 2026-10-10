import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import * as databaseSchema from "@/db/schema";
import {
  buildGuildRaidViewerRankQuery,
  createGuildRaidLifecycleService,
  type GuildRaidEventRecord,
  type GuildRaidLifecycleStore,
  type GuildRaidParticipantRecord,
  type GuildRaidScoreRecord,
  type GuildRaidSettlement,
} from "./guildRaidLifecycle";
import { rankGuildRaidScoresByBoss } from "@/adventure/data/v2/guildRaid";
import {
  GUILD_RAID_BOSSES,
  type GuildRaidBossId,
} from "@/adventure/data/v2/guildRaidBosses";

class MemoryGuildRaidStore implements GuildRaidLifecycleStore {
  events = new Map<string, GuildRaidEventRecord>();
  scores = new Map<string, GuildRaidScoreRecord[]>();
  participants = new Map<string, GuildRaidParticipantRecord[]>();
  createCalls = 0;

  async findEventByWeek(weekKey: string) {
    return [...this.events.values()].find((event) => event.weekKey === weekKey) ?? null;
  }

  async createEvent(event: GuildRaidEventRecord) {
    this.createCalls += 1;
    const existing = await this.findEventByWeek(event.weekKey);
    if (existing) return existing;
    this.events.set(event.id, event);
    return event;
  }

  async listExpiredActiveEventIds(now: Date) {
    return [...this.events.values()]
      .filter((event) => event.status === "active" && event.endsAt <= now)
      .map((event) => event.id);
  }

  async settleEvent(
    eventId: string,
    now: Date,
    build: (
      scores: GuildRaidScoreRecord[],
      participants: GuildRaidParticipantRecord[],
    ) => GuildRaidSettlement,
  ) {
    const event = this.events.get(eventId);
    if (!event || event.status !== "active" || event.endsAt > now) return false;
    const settlement = build(
      this.scores.get(eventId) ?? [],
      this.participants.get(eventId) ?? [],
    );
    this.scores.set(eventId, settlement.scores);
    this.participants.set(eventId, settlement.participants);
    this.events.set(eventId, { ...event, status: "settled", settledAt: now });
    return true;
  }

  async listScores(eventId: string) {
    return this.scores.get(eventId) ?? [];
  }

  private ranked(eventId: string) {
    return rankGuildRaidScoresByBoss(
      (this.scores.get(eventId) ?? []).filter((score) => score.damage > 0),
    ).map((score) => ({ ...score, rank: score.finalRank ?? score.rank }));
  }

  async countScores(eventId: string, bossId: GuildRaidBossId) {
    return (this.scores.get(eventId) ?? []).filter(
      (score) => score.damage > 0 && score.bossKind === bossId,
    ).length;
  }

  async listRankedScoresPage(
    eventId: string,
    bossId: GuildRaidBossId,
    offset: number,
    limit: number,
  ) {
    return this.ranked(eventId)
      .filter((score) => score.bossKind === bossId)
      .sort((a, b) => b.damage - a.damage || a.guildId - b.guildId)
      .slice(offset, offset + limit);
  }

  async findRankedScore(eventId: string, guildId: number) {
    return this.ranked(eventId).find((score) => score.guildId === guildId) ?? null;
  }
}

function score(
  overrides: Partial<GuildRaidScoreRecord> & { guildId: number; damage: number },
): GuildRaidScoreRecord {
  return {
    eventId: "guild-raid:2026-08-17",
    guildName: `길드 ${overrides.guildId}`,
    guildEmblem: null,
    bossKind: "mountain_chief_hard",
    finalRank: null,
    rewardTier: null,
    settledAt: null,
    ...overrides,
  };
}

function activeEvent(overrides: Partial<GuildRaidEventRecord> = {}): GuildRaidEventRecord {
  return {
    id: "guild-raid:2026-08-17",
    weekKey: "2026-08-17",
    bossKind: "mountain_chief_hard",
    startsAt: new Date("2026-08-16T15:00:00.000Z"),
    endsAt: new Date("2026-08-21T15:00:00.000Z"),
    status: "active",
    stage: 1,
    hp: 1_200_000,
    maxHp: 1_200_000,
    settledAt: null,
    ...overrides,
  };
}

describe("길드 토벌전 주간 수명주기", () => {
  it("조회자 길드 순위 서브쿼리를 실제 Drizzle 쿼리로 구성한다", () => {
    const database = drizzle.mock({ schema: databaseSchema });

    const query = buildGuildRaidViewerRankQuery(
      database,
      "guild-raid:2026-08-31",
      42,
    );

    expect(query.toSQL().sql).toContain(
      'rank() over (partition by "boss_kind" order by "damage" desc) as "rank"',
    );
  });

  it("같은 KST 주에는 이벤트를 한 번만 생성한다", async () => {
    const store = new MemoryGuildRaidStore();
    const service = createGuildRaidLifecycleService(store);
    const now = new Date("2026-08-19T03:00:00.000Z");

    const first = await service.ensureCurrentGuildRaid(now);
    const second = await service.ensureCurrentGuildRaid(now);

    expect(first.id).toBe("guild-raid:2026-08-17");
    expect(second.id).toBe(first.id);
    expect(store.createCalls).toBe(1);
    expect(first.endsAt).toEqual(new Date("2026-08-21T15:00:00.000Z"));
  });

  it("토요일 00시부터 길드 순위와 개인 자격을 한 번만 정산한다", async () => {
    const store = new MemoryGuildRaidStore();
    const event = activeEvent();
    store.events.set(event.id, event);
    store.scores.set(event.id, [
      score({ guildId: 3, damage: 20 }),
      score({ guildId: 2, damage: 50 }),
      score({ guildId: 1, damage: 50 }),
    ]);
    store.participants.set(event.id, [
      { eventId: event.id, userId: "u1", guildId: 1, name: "가", damage: 1, attackCount: 3, eligibleAtSettlement: null },
      { eventId: event.id, userId: "u2", guildId: 2, name: "나", damage: 999, attackCount: 2, eligibleAtSettlement: null },
    ]);
    const service = createGuildRaidLifecycleService(store);
    const now = new Date("2026-08-21T15:00:00.000Z");

    expect(await service.settleExpiredGuildRaids(now)).toBe(1);
    expect(await service.settleExpiredGuildRaids(now)).toBe(0);
    expect(store.scores.get(event.id)?.map(({ guildId, finalRank, rewardTier }) => ({ guildId, finalRank, rewardTier }))).toEqual([
      { guildId: 1, finalRank: 1, rewardTier: "standard" },
      { guildId: 2, finalRank: 1, rewardTier: "standard" },
      { guildId: 3, finalRank: 3, rewardTier: "standard" },
    ]);
    expect(store.participants.get(event.id)?.map(({ userId, eligibleAtSettlement }) => ({ userId, eligibleAtSettlement }))).toEqual([
      { userId: "u1", eligibleAtSettlement: true },
      { userId: "u2", eligibleAtSettlement: false },
    ]);
  });

  it("길드 순위를 8개씩 페이지로 나누고 조회자 길드 순위를 별도로 돌려준다", async () => {
    const store = new MemoryGuildRaidStore();
    const event = activeEvent();
    store.events.set(event.id, event);
    store.scores.set(
      event.id,
      Array.from({ length: 51 }, (_, index) =>
        score({ guildId: index + 1, damage: 1_000 - index }),
      ),
    );
    const service = createGuildRaidLifecycleService(store);

    const leaderboard = await service.readGuildRaidLeaderboard(
      event.id,
      "mountain_chief_hard",
      51,
      7,
    );

    expect(leaderboard.rows).toHaveLength(3);
    expect(leaderboard.pagination).toEqual({
      page: 7,
      pageSize: 8,
      totalPages: 7,
      total: 51,
    });
    expect(leaderboard.viewer).toMatchObject({ guildId: 51, rank: 51 });
  });

  it("보스별로 순위와 보상 구간을 따로 정산한다", async () => {
    const store = new MemoryGuildRaidStore();
    const event = activeEvent();
    store.events.set(event.id, event);
    const threshold =
      GUILD_RAID_BOSSES.canyon_predator_raid.bonusMinGuildDamage ?? 0;
    store.scores.set(event.id, [
      score({ guildId: 1, damage: 20 }),
      score({ guildId: 2, damage: 10 }),
      score({ guildId: 3, damage: threshold, bossKind: "canyon_predator_raid" }),
      score({ guildId: 4, damage: threshold - 1, bossKind: "canyon_predator_raid" }),
      score({ guildId: 5, damage: 0, bossKind: "canyon_predator_raid" }),
    ]);
    const service = createGuildRaidLifecycleService(store);

    await service.settleExpiredGuildRaids(new Date("2026-08-21T15:00:00.000Z"));

    const settled = new Map(
      (store.scores.get(event.id) ?? []).map((row) => [row.guildId, row]),
    );
    expect(settled.get(1)).toMatchObject({ finalRank: 1, rewardTier: "standard" });
    expect(settled.get(2)).toMatchObject({ finalRank: 2, rewardTier: "standard" });
    expect(settled.get(3)).toMatchObject({ finalRank: 1, rewardTier: "bonus" });
    expect(settled.get(4)).toMatchObject({ finalRank: 2, rewardTier: "floor" });
    expect(settled.has(5)).toBe(false);
  });

  it("다른 보스 순위표를 보더라도 조회자 순위는 자기 보스 기준이다", async () => {
    const store = new MemoryGuildRaidStore();
    const event = activeEvent();
    store.events.set(event.id, event);
    store.scores.set(event.id, [
      score({ guildId: 1, damage: 20 }),
      score({ guildId: 3, damage: 500, bossKind: "canyon_predator_raid" }),
      score({ guildId: 4, damage: 400, bossKind: "canyon_predator_raid" }),
    ]);
    const service = createGuildRaidLifecycleService(store);

    const leaderboard = await service.readGuildRaidLeaderboard(
      event.id,
      "canyon_predator_raid",
      1,
    );

    expect(leaderboard.rows.map((row) => row.guildId)).toEqual([3, 4]);
    expect(leaderboard.pagination.total).toBe(2);
    expect(leaderboard.viewer).toMatchObject({ guildId: 1, rank: 1 });
  });

  it("새 주간 이벤트는 기본 보스 1단계 체력으로 만든다", async () => {
    const store = new MemoryGuildRaidStore();
    const service = createGuildRaidLifecycleService(store);

    const event = await service.ensureCurrentGuildRaid(
      new Date("2026-08-19T03:00:00.000Z"),
    );

    expect(event.bossKind).toBe("mountain_chief_hard");
    expect(event.maxHp).toBe(1_200_000);
  });

  it("롤오버가 만료 이벤트를 정산하고 현재 주 이벤트를 보장한다", async () => {
    const store = new MemoryGuildRaidStore();
    const expired = activeEvent({
      id: "guild-raid:2026-08-10",
      weekKey: "2026-08-10",
      startsAt: new Date("2026-08-09T15:00:00.000Z"),
      endsAt: new Date("2026-08-14T15:00:00.000Z"),
    });
    store.events.set(expired.id, expired);
    const service = createGuildRaidLifecycleService(store);

    const result = await service.rolloverGuildRaids(
      new Date("2026-08-19T03:00:00.000Z"),
    );

    expect(result).toEqual({ settled: 1, eventId: "guild-raid:2026-08-17" });
    expect(store.events.get(expired.id)?.status).toBe("settled");
  });
});
