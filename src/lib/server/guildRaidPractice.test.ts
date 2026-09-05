import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGuildRaidPracticeService } from "./guildRaidPractice";

const ACTIVE_NOW = new Date("2026-09-03T03:00:00.000Z");
const ACTIVE_CONTEXT = {
  hasGuild: true,
  event: {
    bossKind: "mountain_chief_hard",
    status: "active",
    endsAt: new Date("2026-09-04T15:00:00.000Z"),
  },
};

function battle() {
  return {
    playerName: "연습가",
    damageDealt: 1_234,
    damageTaken: 56,
    diedEarly: false,
    turns: 12,
    replay: {
      enemy: { name: "산군", hp: 1_200_000 },
      playerMaxHp: 500,
      playerMaxMp: 80,
      log: [{ kind: "info", text: "전투 시작" }],
    },
  } as const;
}

describe("길드 토벌전 연습 서비스", () => {
  const readContext = vi.fn();
  const simulate = vi.fn();
  const practice = createGuildRaidPracticeService({ readContext, simulate });

  beforeEach(() => {
    vi.clearAllMocks();
    readContext.mockResolvedValue(ACTIVE_CONTEXT);
    simulate.mockResolvedValue(battle());
  });

  it("현재 보스로 읽기 전용 전투를 계산하고 연습 결과를 반환한다", async () => {
    await expect(
      practice({ userId: "u1", now: ACTIVE_NOW }),
    ).resolves.toMatchObject({
      ok: true,
      practice: true,
      bossKind: "mountain_chief_hard",
      playerName: "연습가",
      damageDealt: 1_234,
      damageTaken: 56,
      diedEarly: false,
      turns: 12,
    });

    expect(readContext).toHaveBeenCalledWith("u1", "2026-08-31");
    expect(simulate).toHaveBeenCalledWith({
      userId: "u1",
      bossKind: "mountain_chief_hard",
    });
  });

  it("현재 길드가 없으면 전투를 계산하지 않는다", async () => {
    readContext.mockResolvedValue({ ...ACTIVE_CONTEXT, hasGuild: false });

    await expect(practice({ userId: "u1", now: ACTIVE_NOW })).resolves.toEqual({
      ok: false,
      error: "no_guild",
    });
    expect(simulate).not.toHaveBeenCalled();
  });

  it("현재 주차 이벤트가 없으면 연습을 거절한다", async () => {
    readContext.mockResolvedValue({ hasGuild: true, event: null });

    await expect(practice({ userId: "u1", now: ACTIVE_NOW })).resolves.toEqual({
      ok: false,
      error: "event_ended",
    });
    expect(simulate).not.toHaveBeenCalled();
  });

  it.each([
    ["정산된", { ...ACTIVE_CONTEXT.event, status: "settled" }],
    [
      "종료 시각이 지난",
      {
        ...ACTIVE_CONTEXT.event,
        endsAt: new Date("2026-09-03T02:59:59.000Z"),
      },
    ],
  ])("%s 토벌전에서도 연습 결과를 반환한다", async (_label, event) => {
    readContext.mockResolvedValue({ hasGuild: true, event });

    await expect(
      practice({ userId: "u1", now: ACTIVE_NOW }),
    ).resolves.toMatchObject({
      ok: true,
      practice: true,
      bossKind: "mountain_chief_hard",
      damageDealt: 1_234,
    });
    expect(simulate).toHaveBeenCalledWith({
      userId: "u1",
      bossKind: "mountain_chief_hard",
    });
  });

  it("보스 식별자가 잘못되면 연습을 거절한다", async () => {
    readContext.mockResolvedValue({
      ...ACTIVE_CONTEXT,
      event: { ...ACTIVE_CONTEXT.event, bossKind: "unknown-boss" },
    });

    await expect(practice({ userId: "u1", now: ACTIVE_NOW })).resolves.toEqual({
      ok: false,
      error: "bad_boss",
    });
    expect(simulate).not.toHaveBeenCalled();
  });

  it("캐릭터가 없으면 명확한 오류를 반환한다", async () => {
    simulate.mockResolvedValue(null);

    await expect(practice({ userId: "u1", now: ACTIVE_NOW })).resolves.toEqual({
      ok: false,
      error: "no_character",
    });
  });
});
