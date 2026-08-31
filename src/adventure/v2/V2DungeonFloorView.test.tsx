import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  LevelUpTutorialTitle,
  RareMapProgressNotice,
  UnexploredHuntSummaryPanel,
  V2DungeonFloorView,
} from "./V2DungeonFloorView";
import { newRareMapInstance } from "@/adventure/data/v2/rareMaps";

vi.mock("@/adventure/storyFlags/useStoryFlags", () => ({
  useStoryFlags: () => ({
    state: { flags: [] },
    set: vi.fn(),
  }),
}));

describe("희귀 탐사 일반 사냥터 복귀", () => {
  it("첫 레벨업 안내 제목에 자체 축하 아이콘을 표시한다", () => {
    const html = renderToStaticMarkup(<LevelUpTutorialTitle />);

    expect(html).toContain('data-plump-icon="celebration"');
    expect(html).toContain("레벨 업!");
    expect(html).not.toContain("🎉");
  });

  it("희귀 탐사 안내에 같은 지역의 일반 사냥터 이동 버튼을 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2DungeonFloorView
        floorId={10}
        outpostId="outpost-1"
        outpostName="마른 협곡 거점"
        playerName="모험가"
        playerGender="male"
        stamina={{ current: 100, lastUpdatedAt: 0 }}
        setStamina={vi.fn()}
        onBack={vi.fn()}
        rareMapIid="rare-map-1"
        onReturnToNormalHunt={vi.fn()}
      />,
    );

    expect(html).toContain("희귀 탐사 진행 중");
    expect(html).toContain("일반 사냥터로");
    expect(html).toContain("희귀 탐사 시작");
  });

  it("진행 안내에 남은 판수와 만료 시간을 함께 표시한다", () => {
    const map = {
      ...newRareMapInstance("worn_map", 10, 1_000, "rare-map-1"),
      runsLeft: 4,
    };
    const html = renderToStaticMarkup(
      <RareMapProgressNotice
        map={map}
        serverNow={map.foundAt}
        onReturnToNormalHunt={vi.fn()}
      />,
    );

    expect(html).toContain("희귀 탐사 진행 중 · 1회 전투");
    expect(html).toContain("보상 4회분");
    expect(html).toContain("30분 동안 개방");
    expect(html).toContain("남은 시간 30:00");
  });
});

describe("미개척지 사냥 화면", () => {
  const summary = {
    difficulty: 105,
    encounterShares: [
      { kind: "base" as const, share: 50 },
      { kind: "pool" as const, poolId: "iron_legion" as const, share: 50 },
    ],
    rewardPct: {
      gold: 10,
      baseMaterial: 20,
      equipment: 20,
      quality: 0,
      specialMaterial: 35,
      rare: 0,
    },
    rareCopyChancePct: 20,
    traceEnabled: true,
    traceExtraChancePct: 10,
  };

  it("shows server-derived difficulty, pool shares, rewards, and trace status", () => {
    const html = renderToStaticMarkup(
      <UnexploredHuntSummaryPanel summary={summary} />,
    );
    expect(html).toContain("난이도 105");
    expect(html).toContain("기본 몬스터 50%");
    expect(html).toContain("철갑 군단 50%");
    expect(html).toContain("특화 재료 +35%");
    expect(html).toContain("흔적 획득 활성");
  });

  it("hides rare-map and offline controls in unexplored mode", () => {
    const html = renderToStaticMarkup(
      <V2DungeonFloorView
        floorId={105}
        huntMode="unexplored"
        unexploredSummary={summary}
        outpostId="outpost-1"
        outpostName="전용 사냥터"
        playerName="모험가"
        playerGender="male"
        stamina={{ current: 100, lastUpdatedAt: 0 }}
        setStamina={vi.fn()}
        onBack={vi.fn()}
        rareMapIid="must-be-hidden"
        onReturnToNormalHunt={vi.fn()}
      />,
    );
    expect(html).toContain("미개척지 · 난이도 105");
    expect(html).not.toContain("희귀 탐사 진행 중");
    expect(html).not.toContain("일반 사냥터로");
    expect(html).not.toContain("희귀 탐사맵 발견 시");
    expect(html).not.toContain("오프라인 사냥");
  });
});
