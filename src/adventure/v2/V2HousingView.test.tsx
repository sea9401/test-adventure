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

function renderHousing(
  playerName?: string,
  previewData: HousingPreviewData = PREVIEW_DATA,
) {
  return renderToStaticMarkup(
    <RewardToastProvider>
      <V2HousingView
        previewData={previewData}
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

describe("V2HousingView 도감 숙련 트로피 전시", () => {
  it("shows artifact and mastery trophy companions together to visitors", () => {
    const room = defaultHousingState();
    room.layout = room.layout.map((placement) => {
      if (placement.furnitureId === "record_shelf") {
        return {
          ...placement,
          masteryTrophy: { trophyId: "mastery:overall" as const },
        };
      }
      if (placement.furnitureId === "trophy_aquarium") {
        return {
          ...placement,
          display: { kind: "fish" as const, fishId: "crucian_carp" as const },
          masteryTrophy: { trophyId: "mastery:fish" as const },
        };
      }
      return placement;
    });
    const html = renderHousing("검은여우", {
      ownerName: "검은여우",
      room,
      displayOptions: [
        {
          kind: "fish",
          fishId: "crucian_carp",
          label: "붕어",
          detail: "흔함 · 개인 최대 34.5cm",
        },
        {
          kind: "masteryTrophy",
          trophyId: "mastery:fish",
          category: "fish",
          currentTier: "platinum",
          label: "만경의 어탁",
          detail: "도감 숙련 · 백금",
        },
        {
          kind: "masteryTrophy",
          trophyId: "mastery:overall",
          category: "overall",
          currentTier: "diamond",
          label: "모험왕의 대서",
          detail: "도감 숙련 · 다이아",
        },
      ],
    });

    expect(html).toContain("모험 기록 서가: 모험왕의 대서");
    expect(html).toContain("대물 전시 수조: 붕어 · 만경의 어탁");
    expect(html).toContain("모험왕의 대서");
    expect(html).toContain("만경의 어탁");
    expect(html).toContain("도감 숙련 · 백금");
    expect(html).toContain("도감 숙련 · 다이아");
    expect(html).toContain("bg-zinc-50");
    expect(html).not.toContain("opacity-40");
  });
});
