import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  GuildRaidPanel,
  GuildRaidPanelContent,
  type GuildRaidState,
} from "./GuildRaidPanel";

function raidState(
  overrides: Partial<GuildRaidState> = {},
): GuildRaidState {
  return {
    ok: true,
    event: {
      id: "2026-W34",
      bossKind: "mountain_chief_hard",
      status: "active",
      stage: 4,
      hp: 750_000,
      maxHp: 1_875_000,
      startsAt: Date.UTC(2026, 7, 16, 15),
      endsAt: Date.UTC(2026, 7, 23, 15),
      settledAt: null,
    },
    my: {
      lockedGuildId: 7,
      damage: 123_456,
      attackCount: 3,
      dailyAttackCount: 0,
      dailyAttackLimit: 3,
      remainingAttacks: 3,
      eligible: true,
    },
    guild: {
      id: 7,
      name: "모험가 길드",
      emblem: null,
      damage: 987_654,
      rank: 2,
    },
    members: [
      {
        userId: "user-1",
        name: "테스터",
        damage: 123_456,
        attackCount: 3,
        eligible: true,
      },
    ],
    leaderboard: [
      {
        guildId: 7,
        guildName: "모험가 길드",
        guildEmblem: null,
        damage: 987_654,
        rank: 2,
      },
    ],
    recentAttacks: [],
    ...overrides,
  };
}

describe("길드 토벌전 패널", () => {
  it("첫 조회 전에는 불러오는 상태를 보여준다", () => {
    const html = renderToStaticMarkup(<GuildRaidPanel />);

    expect(html).toContain("토벌전 정보를 불러오는 중");
  });

  it("단계·남은 공격·길드 순위와 보상 준비 상태를 보여준다", () => {
    const html = renderToStaticMarkup(
      <GuildRaidPanelContent
        state={raidState()}
        attacking={false}
        error={null}
        onAttack={vi.fn()}
      />,
    );

    expect(html).toContain("4단계");
    expect(html).toContain("남은 공격 3/3");
    expect(html).toContain("현재 2위");
    expect(html).toContain("보상 정책 준비 중");
    expect(html).toContain("참여 조건 달성");
    expect(html).toContain("bg-white");
  });

  it("오늘 공격을 모두 썼으면 공격 버튼을 비활성화한다", () => {
    const html = renderToStaticMarkup(
      <GuildRaidPanelContent
        state={raidState({
          my: {
            ...raidState().my,
            dailyAttackCount: 3,
            remainingAttacks: 0,
          },
        })}
        attacking={false}
        error={null}
        onAttack={vi.fn()}
      />,
    );

    expect(html).toContain("오늘 공격을 모두 마쳤습니다");
    expect(html).toContain("disabled");
  });

  it("이벤트 종료 후에는 최종 순위를 표시하고 공격하지 못하게 한다", () => {
    const html = renderToStaticMarkup(
      <GuildRaidPanelContent
        state={raidState({
          event: {
            ...raidState().event,
            status: "settled",
            settledAt: Date.UTC(2026, 7, 23, 15, 1),
          },
        })}
        attacking={false}
        error={null}
        onAttack={vi.fn()}
      />,
    );

    expect(html).toContain("최종 2위");
    expect(html).toContain("이번 토벌전이 종료되었습니다");
  });

  it("종료 직후 정산 중 상태를 명시한다", () => {
    const html = renderToStaticMarkup(
      <GuildRaidPanelContent
        state={raidState({
          event: { ...raidState().event, status: "settling" },
        })}
        attacking={false}
        error={null}
        onAttack={vi.fn()}
      />,
    );

    expect(html).toContain("정산 중 · 잠정 2위");
    expect(html).toContain("최종 순위를 정산하고 있습니다");
  });

  it("참여 도중 길드를 옮긴 경우 주간 길드 고정 안내를 보여준다", () => {
    const html = renderToStaticMarkup(
      <GuildRaidPanelContent
        state={raidState({
          my: { ...raidState().my, lockedGuildId: 99 },
        })}
        attacking={false}
        error="guild_locked"
        onAttack={vi.fn()}
      />,
    );

    expect(html).toContain("이번 주에는 처음 참여한 길드로만 공격할 수 있습니다");
  });
});
