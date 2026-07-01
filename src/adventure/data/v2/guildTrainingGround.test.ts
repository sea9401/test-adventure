import { describe, expect, it } from "vitest";
import {
  claimGuildTrainingDrill,
  guildTrainingDrillViews,
  parseGuildTrainingState,
} from "./guildTrainingGround";

describe("guildTrainingGround — 일일 직업 숙련도 훈련", () => {
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
    });

    expect(views.find((v) => v.id === "basic_stance")).toMatchObject({
      available: true,
      rewardMastery: 3,
    });
    expect(views.find((v) => v.id === "field_rotation")).toMatchObject({
      available: true,
      rewardMastery: 7,
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
    });
    expect(views.find((v) => v.id === "basic_stance")).toMatchObject({
      claimed: true,
      available: false,
      lockedReason: "오늘 완료",
    });
  });
});
