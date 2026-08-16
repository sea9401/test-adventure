import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultHousingState } from "@/adventure/data/v2/housing";
import { RewardToastProvider } from "./RewardToastProvider";
import {
  V2HousingView,
  type HousingPreviewData,
} from "./V2HousingView";

const PREVIEW_DATA: HousingPreviewData = {
  ownerName: "검은여우",
  room: defaultHousingState(),
  displayOptions: [],
};

function renderHousing(playerName?: string) {
  return renderToStaticMarkup(
    <RewardToastProvider>
      <V2HousingView
        previewData={PREVIEW_DATA}
        playerName={playerName}
        onBack={() => {}}
      />
    </RewardToastProvider>,
  );
}

describe("V2HousingView 모바일 방 확대", () => {
  it("편집 가능한 숙소에 44px 확대 전환 버튼을 제공한다", () => {
    const html = renderHousing();

    expect(html).toContain(">방 확대<");
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("min-h-11");
    expect(html).toContain('data-testid="housing-room-scroll"');
    expect(html).toContain('data-testid="housing-room-canvas"');
  });

  it("방문자 숙소에는 편집용 확대 전환을 표시하지 않는다", () => {
    const html = renderHousing("검은여우");

    expect(html).not.toContain(">방 확대<");
    expect(html).not.toContain('data-testid="housing-room-scroll"');
  });
});
