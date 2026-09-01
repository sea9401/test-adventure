import { describe, expect, it } from "vitest";
import {
  resolveGuildRaidAttackMutation,
  validGuildRaidRequestId,
  type GuildRaidAttackMutationInput,
} from "./guildRaidAttack";

function input(
  overrides: Partial<GuildRaidAttackMutationInput> = {},
): GuildRaidAttackMutationInput {
  return {
    now: new Date("2026-08-19T03:00:00.000Z"),
    event: {
      id: "guild-raid:2026-08-17",
      bossKind: "mountain_chief_hard",
      status: "active",
      endsAt: new Date("2026-08-21T15:00:00.000Z"),
    },
    guildProgress: {
      stage: 1,
      hp: 100,
      maxHp: 100,
    },
    guild: { id: 7, name: "일곱", emblem: null },
    participant: null,
    existingAttack: null,
    battle: {
      playerName: "공격자",
      damageDealt: 30,
      damageTaken: 4,
      diedEarly: false,
      turns: 5,
      replay: { enemy: {}, playerMaxHp: 1, playerMaxMp: 0, log: [{}] } as never,
    },
    maxHpForStage: () => 150,
    ...overrides,
  };
}

describe("길드 토벌전 공격 변경", () => {
  it("첫 공격을 현재 길드에 고정하고 개인·길드 피해를 함께 더한다", () => {
    const result = resolveGuildRaidAttackMutation(input());

    expect(result).toMatchObject({
      ok: true,
      participant: {
        guildId: 7,
        damage: 30,
        attackCount: 1,
        dayKey: "2026-08-19",
        dailyAttackCount: 1,
      },
      guildDamageDelta: 30,
      guildProgress: { stage: 1, hp: 70, maxHp: 100 },
    });
  });

  it("KST 날짜가 바뀌면 일일 횟수만 초기화한다", () => {
    const result = resolveGuildRaidAttackMutation(
      input({
        participant: {
          guildId: 7,
          damage: 200,
          attackCount: 4,
          dayKey: "2026-08-18",
          dailyAttackCount: 3,
        },
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      participant: { damage: 230, attackCount: 5, dailyAttackCount: 1 },
    });
  });

  it("같은 날 네 번째 공격은 아무 변경 없이 거절한다", () => {
    const result = resolveGuildRaidAttackMutation(
      input({
        participant: {
          guildId: 7,
          damage: 200,
          attackCount: 3,
          dayKey: "2026-08-19",
          dailyAttackCount: 3,
        },
      }),
    );

    expect(result).toEqual({ ok: false, error: "daily_limit" });
  });

  it("현재 길드가 주간 고정 길드와 다르면 거절하고 원래 길드 재가입은 허용한다", () => {
    const participant = {
      guildId: 7,
      damage: 20,
      attackCount: 1,
      dayKey: "2026-08-19",
      dailyAttackCount: 1,
    };
    expect(
      resolveGuildRaidAttackMutation(
        input({ guild: { id: 8, name: "여덟", emblem: null }, participant }),
      ),
    ).toEqual({ ok: false, error: "guild_locked" });
    expect(resolveGuildRaidAttackMutation(input({ participant }))).toMatchObject({
      ok: true,
      participant: { guildId: 7, attackCount: 2 },
    });
  });

  it("한 번의 원래 피해를 여러 공유 단계에 이월한다", () => {
    const result = resolveGuildRaidAttackMutation(
      input({ battle: { ...input().battle, damageDealt: 260 } }),
    );

    expect(result).toMatchObject({
      ok: true,
      guildProgress: { stage: 3, hp: 140, maxHp: 150 },
      stagesCleared: 2,
      guildDamageDelta: 260,
    });
  });

  it("같은 멱등 키의 기존 공격과 종료된 이벤트를 변경하지 않는다", () => {
    expect(
      resolveGuildRaidAttackMutation(
        input({ existingAttack: { attackId: 91, damageDealt: 30 } }),
      ),
    ).toEqual({ ok: true, alreadyCommitted: true, attackId: 91, damageDealt: 30 });
    expect(
      resolveGuildRaidAttackMutation(
        input({ event: { ...input().event, endsAt: new Date("2026-08-19T02:59:59.000Z") } }),
      ),
    ).toEqual({ ok: false, error: "event_ended" });
  });
});

describe("길드 토벌전 요청 식별자", () => {
  it("8~64자의 영문·숫자·하이픈만 허용한다", () => {
    expect(validGuildRaidRequestId("9be0b4dc-9ea2-4bf1-89d7-41aca694ecb6")).toBe(true);
    expect(validGuildRaidRequestId("short")).toBe(false);
    expect(validGuildRaidRequestId("abcdefgh!")).toBe(false);
  });
});
