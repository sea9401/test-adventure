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
        }}
        loading={false}
        buying={null}
        onBuy={vi.fn(async () => ({ ok: true, message: "완료" }))}
      />,
    );

    expect(html).toContain("숙련도 효과 · 특별 손님 +24.12%");
    expect(html).toContain("장착 총합 · 특별 손님 +54.12%");
    expect(html).not.toContain("54.120000000000005");
  });
});
