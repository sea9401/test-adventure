import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fishingCatchItemDailyProgress } from "./fishingStock";
import { FishingDailyCatchChecklist } from "./FishingDailyCatchChecklist";

describe("FishingDailyCatchChecklist", () => {
  it("어획물 5종의 오늘 획득량과 최대치를 표시한다", () => {
    const html = renderToStaticMarkup(
      <FishingDailyCatchChecklist
        items={fishingCatchItemDailyProgress(
          {
            version: 1,
            items: {},
            daily: {
              date: "2026-08-25",
              awarded: { catch_common: 12 },
            },
          },
          "2026-08-25",
        )}
      />,
    );

    expect(html).toContain("요리 재료 일일 획득");
    expect(html).toContain("일반 어획물");
    expect(html).toContain("12 / 50");
    expect(html).toContain("전설의 어획물");
    expect(html).toContain("0 / 3");
    expect(html).toContain("bg-zinc-50");
    expect(html).not.toMatch(/bg-[^\s\"]+\/\d+/);
  });

  it("최대치에 도달한 행을 완료 상태로 읽을 수 있다", () => {
    const html = renderToStaticMarkup(
      <FishingDailyCatchChecklist
        items={[
          {
            itemId: "catch_special",
            name: "특급 어획물",
            awarded: 10,
            cap: 10,
          },
        ]}
      />,
    );

    expect(html).toContain("완료");
    expect(html).toContain('aria-label="특급 어획물 완료"');
  });
});
