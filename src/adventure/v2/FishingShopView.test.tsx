import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  emptyFishingProgression,
  fishingLevelXpThreshold,
  fishingProgressionView,
} from "./fishingProgression";
import { FishingShopView } from "./FishingShopView";

describe("낚시 상점 숙련도 표시", () => {
  it("숙련도와 장비를 합산한 보너스의 부동소수점 꼬리를 숨긴다", () => {
    const base = emptyFishingProgression();
    const progression = fishingProgressionView({
      ...base,
      xp: fishingLevelXpThreshold(51),
      ownedLures: [...base.ownedLures, "prism_lure"],
      equippedLureId: "prism_lure",
    });

    const html = renderToStaticMarkup(
      <FishingShopView
        state={{
          coins: 0,
          ownedTitleIds: [],
          staminaPotions: 0,
          progression,
          seedPouch: null,
          staminaPotionLimit: null,
          abyssalBait: null,
        }}
        loading={false}
        buying={null}
        onBuy={vi.fn(async () => ({ ok: true, message: "완료" }))}
      />,
    );

    expect(html).toContain("숙련도 효과 · 특별 손님 +24.12%");
    expect(html).toContain("숙련도 효과 · 어획물 획득 40%");
    expect(html).toContain("장착 총합 · 특별 손님 +54.12%");
    expect(html).not.toContain("54.120000000000005");
  });

  it("심연어룡 소환 미끼의 즉시 소환 안내와 주간 한도를 표시한다", () => {
    const html = renderToStaticMarkup(
      <FishingShopView
        state={{
          coins: 20_000,
          ownedTitleIds: [],
          staminaPotions: 0,
          progression: null,
          seedPouch: null,
          staminaPotionLimit: null,
          abyssalBait: {
            boughtToday: 1,
            dailyLimit: 1,
            remainingToday: 0,
          },
        }}
        loading={false}
        buying={null}
        onBuy={vi.fn(async () => ({ ok: true, message: "완료" }))}
        onBuyConsumable={vi.fn(async () => ({ ok: true, message: "완료" }))}
      />,
    );

    expect(html).toContain("심연어룡 소환 미끼");
    expect(html).toContain("구매 즉시 나만 볼 수 있는 심연어룡을 확정 소환한다");
    expect(html).toContain("오늘 1/1");
    expect(html).toContain("오늘 한도");
  });
});
