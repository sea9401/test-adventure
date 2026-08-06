import { describe, expect, it } from "vitest";
import { guildExplorationEventRewardText } from "./GuildExplorationPanel";

describe("탐사 지도 사건 보상 표시", () => {
  it("길드 금고와 명성 보상을 선택 전에 정확히 표시한다", () => {
    expect(
      guildExplorationEventRewardText({ rewardGold: 2_800_000 }),
    ).toBe("길드 금고 +2,800,000G");
    expect(guildExplorationEventRewardText({ rewardFame: 130 })).toBe(
      "길드 명성 +130",
    );
    expect(
      guildExplorationEventRewardText({
        rewardGold: 1_000_000,
        rewardFame: 50,
      }),
    ).toBe("길드 금고 +1,000,000G · 길드 명성 +50");
  });
});
