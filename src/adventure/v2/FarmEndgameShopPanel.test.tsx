// @vitest-environment jsdom

import { fireEvent, render, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FARM_ENDGAME_SHOP_ITEMS,
  type FarmEndgameShopView,
} from "./farmEndgameShop";
import { FarmEndgameShopPanel } from "./FarmEndgameShopPanel";
import { GameDialogHost } from "@/components/ui/GameDialogHost";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("농장주의 교환소 패널", () => {
  it("잠긴 교환소는 시설 진행도만 표시한다", () => {
    const html = renderToStaticMarkup(
      <FarmEndgameShopPanel
        view={{
          unlocked: false,
          plots: 7,
          requiredPlots: 8,
          pens: 3,
          requiredPens: 4,
          items: [...FARM_ENDGAME_SHOP_ITEMS],
          ownedTitleIds: [],
        }}
        availableReputation={10_000}
        busyItemId={null}
        onBuy={vi.fn()}
      />,
    );

    expect(html).toContain("농장주의 교환소");
    expect(html).toContain("밭 7/8");
    expect(html).toContain("축사 3/4");
    expect(html).not.toContain("목장 사료 꾸러미");
    expect(html).toContain("bg-white");
    expect(html).toContain("dark:bg-zinc-900");
  });

  it("해금 후 반복 상품과 보유·부족 상태를 표시한다", () => {
    const html = renderToStaticMarkup(
      <FarmEndgameShopPanel
        view={{
          unlocked: true,
          plots: 8,
          requiredPlots: 8,
          pens: 4,
          requiredPens: 4,
          items: [...FARM_ENDGAME_SHOP_ITEMS],
          ownedTitleIds: ["farm_bountiful_hand"],
        }}
        availableReputation={100}
        busyItemId={null}
        onBuy={vi.fn()}
      />,
    );

    expect(html).toContain("목장 사료 꾸러미");
    expect(html).toContain("영농 거름 꾸러미");
    expect(html).toContain("보유 중");
    expect(html).toContain("증표 부족");
  });

  it("칭호는 이름과 가격을 확인한 뒤 구매한다", async () => {
    const unlockedView: FarmEndgameShopView = {
      unlocked: true,
      plots: 8,
      requiredPlots: 8,
      pens: 4,
      requiredPens: 4,
      items: [...FARM_ENDGAME_SHOP_ITEMS],
      ownedTitleIds: [],
    };
    const onBuy = vi.fn();
    const screen = render(
      <>
        <FarmEndgameShopPanel
          view={unlockedView}
          availableReputation={10_000}
          busyItemId={null}
          onBuy={onBuy}
        />
        <GameDialogHost />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "풍요의 손 구매" }));

    expect(await screen.findByText(/농장 증표 1,000개가 사용됩니다/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    await waitFor(() => {
      expect(onBuy).toHaveBeenCalledWith("title-bountiful-hand");
    });
  });
});
