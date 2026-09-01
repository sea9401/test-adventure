import { describe, expect, it } from "vitest";
import {
  createGuildRaidLifecycleService,
  type GuildRaidEventRecord,
  type GuildRaidLifecycleStore,
  type GuildRaidParticipantRecord,
  type GuildRaidScoreRecord,
  type GuildRaidSettlement,
} from "./guildRaidLifecycle";
import { rankGuildRaidScores } from "@/adventure/data/v2/guildRaid";

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

  async countScores(eventId: string) {
    return (this.scores.get(eventId) ?? []).filter((score) => score.damage > 0)
      .length;
  }

  async listRankedScoresPage(eventId: string, offset: number, limit: number) {
    return rankGuildRaidScores(
      (this.scores.get(eventId) ?? []).filter((score) => score.damage > 0),
    )
      .map((score) => ({
        ...score,
        rank: score.finalRank ?? score.rank,
      }))
      .slice(offset, offset + limit);
  }

  async findRankedScore(eventId: string, guildId: number) {
    return (
      rankGuildRaidScores(
        (this.scores.get(eventId) ?? []).filter((score) => score.damage > 0),
      )
        .map((score) => ({ ...score, rank: score.finalRank ?? score.rank }))
        .find((score) => score.guildId === guildId) ?? null
    );
  }
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
      { eventId: event.id, guildId: 3, guildName: "셋", guildEmblem: null, damage: 20, finalRank: null, settledAt: null },
      { eventId: event.id, guildId: 2, guildName: "둘", guildEmblem: null, damage: 50, finalRank: null, settledAt: null },
      { eventId: event.id, guildId: 1, guildName: "하나", guildEmblem: null, damage: 50, finalRank: null, settledAt: null },
    ]);
    store.participants.set(event.id, [
      { eventId: event.id, userId: "u1", guildId: 1, name: "가", damage: 1, attackCount: 3, eligibleAtSettlement: null },
      { eventId: event.id, userId: "u2", guildId: 2, name: "나", damage: 999, attackCount: 2, eligibleAtSettlement: null },
    ]);
    const service = createGuildRaidLifecycleService(store);
    const now = new Date("2026-08-21T15:00:00.000Z");

    expect(await service.settleExpiredGuildRaids(now)).toBe(1);
    expect(await service.settleExpiredGuildRaids(now)).toBe(0);
    expect(store.scores.get(event.id)?.map(({ guildId, finalRank }) => ({ guildId, finalRank }))).toEqual([
      { guildId: 1, finalRank: 1 },
      { guildId: 2, finalRank: 1 },
      { guildId: 3, finalRank: 3 },
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
      Array.from({ length: 51 }, (_, index) => ({
        eventId: event.id,
        guildId: index + 1,
        guildName: `길드 ${index + 1}`,
        guildEmblem: null,
        damage: 1_000 - index,
        finalRank: null,
        settledAt: null,
      })),
    );
    const service = createGuildRaidLifecycleService(store);

    const leaderboard = await service.readGuildRaidLeaderboard(event.id, 51, 7);

    expect(leaderboard.rows).toHaveLength(3);
    expect(leaderboard.pagination).toEqual({
      page: 7,
      pageSize: 8,
      totalPages: 7,
      total: 51,
    });
    expect(leaderboard.viewer).toMatchObject({ guildId: 51, rank: 51 });
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
