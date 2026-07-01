import { describe, expect, it } from "vitest";
import {
  claimGuildTrainingDrill,
  GUILD_TRAINING_DRILL_IDS,
  guildTrainingDayWindow,
  guildTrainingDrillViews,
  parseGuildTrainingState,
  todayGuildTrainingKey,
  type GuildTrainingState,
} from "./guildTrainingGround";

describe("guildTrainingGround — 일일 직업 숙련도 훈련", () => {
  it("일일 키는 한국 시간 자정 기준으로 바뀐다", () => {
    expect(todayGuildTrainingKey(new Date("2026-07-01T14:59:59.000Z"))).toBe(
      "2026-07-01",
    );
    expect(todayGuildTrainingKey(new Date("2026-07-01T15:00:00.000Z"))).toBe(
      "2026-07-02",
    );
  });

  it("일일 집계 구간도 한국 시간 자정 기준이다", () => {
    const window = guildTrainingDayWindow(
      new Date("2026-07-01T15:30:00.000Z"),
    );

    expect(window.dayKey).toBe("2026-07-02");
    expect(window.start.toISOString()).toBe("2026-07-01T15:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-07-02T15:00:00.000Z");
  });

  it("날짜가 바뀌면 완료 상태를 초기화한다", () => {
    expect(
      parseGuildTrainingState(
        { dayKey: "2026-06-30", claimed: ["basic_stance"] },
        "2026-07-01",
      ),
    ).toEqual({ dayKey: "2026-07-01", claimed: [] });
  });

  it("건물 레벨과 캐릭터 레벨에 따라 훈련 과제를 잠근다", () => {
    const state = parseGuildTrainingState(
      { dayKey: "2026-07-01", claimed: [] },
      "2026-07-01",
    );
    const views = guildTrainingDrillViews({
      state,
      buildingLevel: 3,
      characterLevel: 50,
      hasJob: true,
      currentClass: "warrior",
    });

    expect(GUILD_TRAINING_DRILL_IDS).toContain("weapon_flow");
    expect(GUILD_TRAINING_DRILL_IDS).toContain("guard_breathing");
    expect(GUILD_TRAINING_DRILL_IDS).toContain("arcane_control");
    expect(GUILD_TRAINING_DRILL_IDS).toContain("shadow_footwork");
    expect(GUILD_TRAINING_DRILL_IDS).toContain("recovery_camp");
    expect(views.find((v) => v.id === "basic_stance")).toMatchObject({
      available: true,
      rewardMastery: 4,
      focusLabel: "공용",
    });
    expect(views.find((v) => v.id === "weapon_flow")).toMatchObject({
      available: true,
      rewardMastery: 7,
      focusLabel: "전사",
    });
    expect(views.find((v) => v.id === "guard_breathing")).toMatchObject({
      available: false,
      lockedReason: "무도가 계열 전용",
    });
    expect(views.find((v) => v.id === "field_rotation")).toMatchObject({
      available: true,
      rewardMastery: 9,
    });
    expect(views.find((v) => v.id === "master_trial")).toMatchObject({
      available: false,
      lockedReason: "훈련장 Lv 5 필요",
    });
  });

  it("수령한 과제는 같은 날 다시 수령할 수 없다", () => {
    const state = claimGuildTrainingDrill(
      { dayKey: "2026-07-01", claimed: [] },
      "basic_stance",
    );
    const views = guildTrainingDrillViews({
      state,
      buildingLevel: 5,
      characterLevel: 100,
      hasJob: true,
      currentClass: "mage",
    });
    expect(views.find((v) => v.id === "basic_stance")).toMatchObject({
      claimed: true,
      available: false,
      lockedReason: "오늘 완료",
    });
  });

  it("훈련장 레벨별 일일 훈련 횟수를 초과하면 남은 훈련을 잠근다", () => {
    const state: GuildTrainingState = {
      dayKey: "2026-07-01",
      claimed: ["basic_stance", "weapon_flow"],
    };
    const views = guildTrainingDrillViews({
      state,
      buildingLevel: 3,
      characterLevel: 80,
      hasJob: true,
      currentClass: "warrior",
    });

    expect(views.find((v) => v.id === "field_rotation")).toMatchObject({
      available: false,
      lockedReason: "오늘 훈련 횟수 소진",
    });
  });
});
