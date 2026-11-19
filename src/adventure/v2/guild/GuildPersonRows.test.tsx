import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuildArtisanContributionPanel } from "./GuildArtisanContributionPanel";
import { GuildContributionPanel } from "./GuildContributionPanel";
import type {
  GuildContributionResponse,
  GuildInfoResponse,
} from "./guildShared";

// 길드 목록의 사람 줄 — 이름 앞에 줄 머리 프사가 붙는지 확인한다.
function member(
  userId: string,
  name: string,
  avatar: string,
  totalCrafts = 0,
): NonNullable<GuildInfoResponse["members"]>[number] {
  return {
    userId,
    role: "member",
    joinedAt: "2026-11-01T00:00:00.000Z",
    name,
    avatar,
    profileBorder: userId === "u-1" ? "royal" : null,
    level: 120,
    job: "모험가",
    lastSeenAt: null,
    honorEarned: 0,
    artisan: {
      blacksmith: {
        level: 3,
        xpIntoLevel: 10,
        xpForNext: 100,
        totalCrafts,
        qualityCrafts: 0,
      },
    },
  } as NonNullable<GuildInfoResponse["members"]>[number];
}

const info = {
  members: [
    member("u-1", "새벽빛", "female1", 12),
    member("u-2", "돌담", "monster:슬라임", 4),
  ],
} as GuildInfoResponse;

describe("길드 목록의 사람 줄", () => {
  it("길드 기여도는 길드원 이름 앞에 프사와 테두리 꾸미기를 보여 준다", () => {
    const data = {
      viewerUserId: "u-2",
      rows: [
        {
          userId: "u-1",
          weeklyPoints: 48_210,
          lifetimePoints: 1_203_400,
          weeklyByCategory: {},
          lifetimeByCategory: {},
        },
        {
          userId: "u-2",
          weeklyPoints: 8_450,
          lifetimePoints: 402_310,
          weeklyByCategory: {},
          lifetimeByCategory: {},
        },
      ],
    } as unknown as GuildContributionResponse;
    const html = renderToStaticMarkup(
      <GuildContributionPanel data={data} info={info} loading={false} />,
    );

    expect(html.match(/ui-row-thumb/g)).toHaveLength(2);
    expect(html).toContain("ui-profile-frame-royal");
    expect(html.indexOf("ui-row-thumb")).toBeLessThan(html.indexOf("새벽빛"));
    expect(html).toContain("48,210");
  });

  it("제작 기여도도 같은 줄 머리 프사를 쓴다", () => {
    const html = renderToStaticMarkup(
      <GuildArtisanContributionPanel info={info} />,
    );

    expect(html.match(/ui-row-thumb/g)).toHaveLength(2);
    expect(html.indexOf("ui-row-thumb")).toBeLessThan(html.indexOf("새벽빛"));
  });
});
