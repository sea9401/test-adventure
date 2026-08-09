import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { V2DungeonFloorView } from "./V2DungeonFloorView";

vi.mock("@/adventure/storyFlags/useStoryFlags", () => ({
  useStoryFlags: () => ({
    state: { flags: [] },
    set: vi.fn(),
  }),
}));

describe("희귀 탐사 일반 사냥터 복귀", () => {
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
  });
});
