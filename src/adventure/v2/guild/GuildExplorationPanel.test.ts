import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  GuildExplorationPanel,
  guildExplorationEventRewardText,
  guildExplorationExpeditionScheduleText,
} from "./GuildExplorationPanel";

describe("길드 탐사 표면", () => {
  it("원정 카드는 중립 다크 표면을 쓰고 cyan 액션 강조를 유지한다", () => {
    const html = renderToStaticMarkup(
      createElement(GuildExplorationPanel, { canManage: true }),
    );

    expect(html).toContain("dark:bg-zinc-950");
    expect(html).toContain("border-cyan-700 bg-cyan-700");
    expect(html).not.toContain("dark:bg-zinc-950/");
  });
});

describe("원정대 파견 일정 표시", () => {
  it("파견·완료 시각과 소요 시간을 같은 KST 일정으로 안내한다", () => {
    expect(
      guildExplorationExpeditionScheduleText(
        {
          expeditionId: "ancient_ruins",
          startedAt: "2026-08-16T16:00:00.000Z",
          endsAt: "2026-08-16T18:00:00.000Z",
        },
        120,
      ),
    ).toBe(
      "파견 08.17 01:00 KST · 완료 08.17 03:00 KST · 소요 2시간",
    );
  });
});

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
