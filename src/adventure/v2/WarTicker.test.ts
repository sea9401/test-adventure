import { describe, expect, it, vi } from "vitest";
import type { FeedEntry } from "@/lib/feed-config";
import { visibleWarTickerEntries, warTickerText } from "./WarTicker";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const NOW = Date.UTC(2026, 7, 4, 11, 20);

function entry(
  id: number,
  type: FeedEntry["type"],
  payload: FeedEntry["payload"],
  createdAt: number,
): FeedEntry {
  return { id, type, actorName: `모험가${id}`, payload, createdAt };
}

describe("WarTicker 협동 보스 시각", () => {
  it("소환에만 짧은 상대 시간을 붙인다", () => {
    const summon = entry(
      1,
      "coop_summon",
      { kind: "mountain_chief", expiresAt: NOW + 3_600_000 },
      NOW - 12 * 60_000,
    );
    const kill = entry(
      2,
      "coop_kill",
      { kind: "mountain_chief" },
      NOW - 5 * 60_000,
    );

    expect(warTickerText(summon, NOW)).toContain("· 12분 전");
    expect(warTickerText(kill, NOW)).not.toContain("분 전");
  });

  it("만료되거나 처치된 세션의 소환 모집을 숨긴다", () => {
    const rows = [
      entry(
        1,
        "coop_summon",
        {
          kind: "mountain_chief",
          sessionId: "active",
          expiresAt: NOW + 60_000,
        },
        NOW - 3_000,
      ),
      entry(
        2,
        "coop_summon",
        {
          kind: "mountain_chief",
          sessionId: "expired",
          expiresAt: NOW,
        },
        NOW - 2_000,
      ),
      entry(
        3,
        "coop_summon",
        {
          kind: "mountain_chief",
          sessionId: "defeated",
          expiresAt: NOW + 60_000,
        },
        NOW - 4_000,
      ),
      entry(
        4,
        "coop_kill",
        { kind: "mountain_chief", sessionId: "defeated" },
        NOW - 1_000,
      ),
    ];

    const visibleIds = visibleWarTickerEntries(rows, NOW).map((row) => row.id);
    expect(visibleIds).toContain(1);
    expect(visibleIds).toContain(4);
    expect(visibleIds).not.toContain(2);
    expect(visibleIds).not.toContain(3);
  });
});

describe("WarTicker 수행 각성", () => {
  it("각성한 캐릭터 이름과 5배 결과를 표시한다", () => {
    const awakened = entry(
      5,
      "cultivation_awakening",
      { cultivationMult: 5 },
      NOW,
    );

    expect(warTickerText(awakened, NOW)).toBe(
      "모험가5 님이 수행에서 각성! 스탯 한계치 증가량 ×5",
    );
  });
});

describe("WarTicker 생활 도안", () => {
  it("비공개 숙소 가구 도안의 과거 알림을 숨긴다", () => {
    const housingBlueprint = entry(
      6,
      "life_blueprint",
      { recipeId: "fishing_trophy_wall" },
      NOW,
    );
    const activeAidBlueprint = entry(
      7,
      "life_blueprint",
      { recipeId: "logging_wedge_master" },
      NOW,
    );

    expect(warTickerText(housingBlueprint, NOW)).toBeNull();
    expect(warTickerText(activeAidBlueprint, NOW)).toContain("명인의 벌목 쐐기");
  });
});
