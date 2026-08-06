import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { V2TrophyCabinetView } from "./V2TrophyCabinetView";

describe("V2TrophyCabinetView", () => {
  it("shows a compact representative area and an opaque unlocked/locked grid", () => {
    const html = renderToStaticMarkup(
      <V2TrophyCabinetView
        previewData={{
          ok: true,
          standOwned: true,
          visible: true,
          slots: [
            { kind: "achievement", achievementId: "battle_100" },
            null,
            null,
          ],
          trophyOptions: [
            {
              id: "battle_100",
              title: "백전",
              desc: "전투를 100회 완료하세요.",
              points: 10,
              badgeTier: "bronze",
              unlocked: true,
            },
            {
              id: "boss_10",
              title: "거인 사냥꾼",
              desc: "보스를 10회 처치하세요.",
              points: 30,
              badgeTier: "gold",
              unlocked: false,
            },
          ],
        }}
      />,
    );

    expect(html).toContain("대표 트로피 3종");
    expect(html).toContain("1 / 2 획득");
    expect(html).toContain("백전");
    expect(html).toContain("거인 사냥꾼");
    expect(html).toContain("미획득");
    expect(html).toContain("bg-zinc-50");
    expect(html).not.toContain("opacity-40");
  });

  it("keeps collection browsing available before purchasing the display stand", () => {
    const html = renderToStaticMarkup(
      <V2TrophyCabinetView
        previewData={{
          ok: true,
          standOwned: false,
          slots: [null, null, null],
          trophyOptions: [],
        }}
      />,
    );

    expect(html).toContain("트로피 수집 현황은 볼 수 있지만");
    expect(html).toContain("대표 배지 전시대가 필요합니다");
  });
});
