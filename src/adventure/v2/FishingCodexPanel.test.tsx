import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  FishingCodexList,
  weeklyFishingRanks,
  weeklyFishingStatusLabel,
  type FishingCodexListProps,
} from "./FishingCodexPanel";
import {
  FISH,
  FISH_IDS,
  type FishId,
} from "@/adventure/data/v2/fish";
import type { FishingLeaderboardData } from "./fishingLeaderboard";

const META = {
  total: FISH_IDS.length,
  spBonus: 0,
  milestones: [] as number[],
  nextMilestone: null,
};

function renderFishCodex(
  overrides: Partial<FishingCodexListProps> = {},
): string {
  return renderToStaticMarkup(
    <FishingCodexList
      registeredIds={new Set()}
      caughtIds={new Set()}
      best={{}}
      meta={META}
      ranks={{}}
      weeklyState="ready"
      showUnrankedOnly={false}
      onShowUnrankedOnlyChange={() => undefined}
      extractBusy={false}
      onPreviewExtraction={() => undefined}
      {...overrides}
    />,
  );
}

describe("어보 주간 순위 파생", () => {
  it("상위 목록 밖에 붙은 본인 행에서도 실제 순위를 찾는다", () => {
    const data: FishingLeaderboardData = {
      seasonId: "2026-W33",
      endsAt: "2026-08-17T00:00:00.000Z",
      myCoins: 0,
      byFish: {
        carp: [
          { rank: 1, name: "월척왕", size: 99, isMe: false },
          { rank: 17, name: "나", size: 92, isMe: true },
        ],
      },
    };

    expect(weeklyFishingRanks(data)).toEqual({ carp: 17 });
  });

  it("조회 상태를 미등록 기록으로 오인하지 않는다", () => {
    expect(weeklyFishingStatusLabel(undefined, "loading")).toBe(
      "주간 확인 중",
    );
    expect(weeklyFishingStatusLabel(undefined, "error")).toBe(
      "주간 순위 확인 불가",
    );
    expect(weeklyFishingStatusLabel(undefined, "ready")).toBe("주간 미등록");
    expect(weeklyFishingStatusLabel(17, "ready")).toBe("주간 17위");
  });
});

describe("모험의 서 어보 주간 현황", () => {
  it("미발견 이름은 공개하고 설명은 숨기며 주간 순위와 최대어를 나란히 보여준다", () => {
    const html = renderFishCodex({
      registeredIds: new Set(["carp"]),
      caughtIds: new Set(["carp"]),
      best: { carp: 92 },
      ranks: { carp: 17 },
    });

    expect(html).toContain("붕어");
    expect(html).toContain("미발견");
    expect(html).not.toContain(FISH.crucian_carp.description);
    expect(html).toContain("주간 17위");
    expect(html).toContain("최대어 92cm");
    expect(html).toContain("주간 미등록");
    expect(html).toContain("최대어 —");
    expect(html).toContain("표본 추출");
  });

  it("미등록만 필터는 순위가 없는 어종과 등급만 남긴다", () => {
    const ranks = Object.fromEntries(
      FISH_IDS.filter((id) => id !== "crucian_carp").map((id) => [id, 1]),
    ) as Partial<Record<FishId, number>>;

    const html = renderFishCodex({
      ranks,
      showUnrankedOnly: true,
    });

    expect(html).toContain("붕어");
    expect(html).not.toContain("잉어");
    expect(html).not.toContain("1등 보상 60코인");
    expect(html).toContain("주간 미등록만 1");
    expect(html).toContain('aria-pressed="true"');
  });

  it("모든 어종에 기록이 있으면 필터 결과 완료 상태를 보여준다", () => {
    const ranks = Object.fromEntries(
      FISH_IDS.map((id) => [id, 1]),
    ) as Record<FishId, number>;

    const html = renderFishCodex({
      ranks,
      showUnrankedOnly: true,
    });

    expect(html).toContain("이번 주 모든 어종에 기록을 등록했습니다.");
  });

  it("로딩과 오류 중에는 필터를 비활성화하고 상태를 명확히 표시한다", () => {
    const loadingHtml = renderFishCodex({ weeklyState: "loading" });
    const errorHtml = renderFishCodex({ weeklyState: "error" });

    expect(loadingHtml).toContain("주간 확인 중");
    expect(loadingHtml).toContain("disabled");
    expect(errorHtml).toContain("주간 순위 확인 불가");
    expect(errorHtml).toContain("disabled");
  });

  it("표본이 등록되지 않은 어종에는 추출 동작을 노출하지 않는다", () => {
    const html = renderFishCodex({
      caughtIds: new Set(["carp"]),
      best: { carp: 92 },
    });

    expect(html).toContain("미등록");
    expect(html).not.toContain("표본 추출");
  });
});
