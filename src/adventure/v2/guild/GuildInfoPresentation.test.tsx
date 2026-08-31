// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GuildInfoPanel } from "./GuildInfoPanel";
import { GuildContributionPanel } from "./GuildContributionPanel";
import type {
  GuildContributionResponse,
  GuildInfoResponse,
} from "./guildShared";

vi.mock("./GuildCombatSupplyPanel", () => ({
  GuildCombatSupplySummary: () => null,
}));
vi.mock("../GuildGoldDepositPanel", () => ({
  GuildGoldDepositPanel: () => null,
}));
vi.mock("../GuildActivityList", () => ({
  GuildActivityList: () => null,
}));

afterEach(cleanup);

const GUILD_INFO: GuildInfoResponse = {
  ok: true,
  guild: {
    id: 1,
    name: "테스트 길드",
    masterId: "master-1",
    createdAt: "2026-08-24T00:00:00.000Z",
    fameTotal: 20_000,
    fameAvailable: 14_000,
    level: 4,
    levelUpgradeCost: {
      currentLevel: 4,
      nextLevel: 5,
      fame: 14_000,
      gold: 100_000_000,
    },
    description: null,
    emblem: null,
    color: null,
    nationName: null,
    nationDeclaredAt: null,
  },
  members: [],
  isMaster: false,
  isManager: false,
  pendingRequests: [],
  memberCap: 9,
  hasMetropolis: false,
  canDeclareNation: false,
  guildGold: 0,
  settlementBuildings: {},
  settlementBuildingLevels: {},
  hasGuildSmithy: false,
  hasTrainingGround: false,
  hasMapWorkshop: false,
};

const CONTRIBUTION: GuildContributionResponse = {
  ok: true,
  viewerUserId: "viewer-1",
  weekStartsAt: "2026-08-24T00:00:00.000Z",
  rows: [],
};

describe("길드 정보 안내", () => {
  it("장문의 승급 설명 대신 다음 레벨 달성 보상을 바로 표시한다", () => {
    render(
      <GuildInfoPanel
        info={GUILD_INFO}
        loading={false}
        activity={[]}
        contribution={CONTRIBUTION}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText("다음 길드 마일스톤 · Lv.5")).toBeTruthy();
    expect(screen.getByText("길드원 정원 +1명")).toBeTruthy();
    expect(screen.queryByText(/관리자가 길드 연구에서/)).toBeNull();
  });

  it("기여도 규칙은 본문 대신 탭과 호버로 여는 도움말에 표시한다", () => {
    render(
      <GuildContributionPanel
        data={CONTRIBUTION}
        info={GUILD_INFO}
        loading={false}
      />,
    );

    expect(screen.queryByText(/매주 월요일 00:00/)).toBeNull();
    expect(screen.queryByText(/10,000G당 1점/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "길드 기여도 도움말" }));

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toContain("매주 월요일 00:00");
    expect(tooltip.textContent).toContain("10,000G당 1점");
  });
});
