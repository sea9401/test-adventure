import { describe, expect, it } from "vitest";
import { deriveReferralTutorialSnapshot } from "./referralTutorialProgress";

describe("referral tutorial progress", () => {
  it("사냥·길드·다섯 생활 중 최고 레벨에서 독립 과제를 모두 도출한다", () => {
    const snapshot = deriveReferralTutorialSnapshot({
      characterRaw: { frontierDepth: 36 },
      hasGuild: true,
      farmRaw: { stats: { farmingXp: 810 } },
      fishingRaw: {},
      woodcuttingRaw: {},
      miningRaw: {},
      cookingRaw: {},
    });

    expect(snapshot).toEqual({
      frontierDepth: 36,
      hasGuild: true,
      maxLifeLevel: 10,
      taskIds: [
        "hunt_depth_24",
        "join_guild",
        "life_level_5",
        "hunt_depth_36",
        "life_level_10",
      ],
    });
  });

  it("오염되거나 미달인 상태는 기본 레벨과 빈 과제로 정규화한다", () => {
    const snapshot = deriveReferralTutorialSnapshot({
      characterRaw: { frontierDepth: "broken" },
      hasGuild: false,
      farmRaw: null,
      fishingRaw: null,
      woodcuttingRaw: null,
      miningRaw: null,
      cookingRaw: null,
    });

    expect(snapshot).toEqual({
      frontierDepth: 0,
      hasGuild: false,
      maxLifeLevel: 1,
      taskIds: [],
    });
  });
});
