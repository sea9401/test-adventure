// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RareMapsTab } from "./RareMapsTab";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(cleanup);

describe("RareMapsTab 이벤트 소모품", () => {
  it("100레벨 비약에 이벤트 태그와 전용 사용 설명을 표시한다", () => {
    const html = renderToStaticMarkup(
      <RareMapsTab
        materials={{}}
        spFruitUsed={{ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }}
        busy={null}
        onUseSpFruit={() => undefined}
        onUseEquipmentBox={() => undefined}
        onUseMasteryTome={() => undefined}
        masteryCertificates={0}
        onUseMasteryCertificate={() => undefined}
        rareMaps={[]}
        cashItems={{ level_100_elixir: 1 }}
        onUseCashItem={() => undefined}
        cookingFoods={{}}
        cookingFoodDefinitions={{}}
        onUseCookingFood={() => undefined}
        onUseExpTome={() => undefined}
        fishSpecimens={{}}
        registeredFishIds={[]}
        onUseFishSpecimen={() => undefined}
      />,
    );

    expect(html).toContain("100레벨 달성의 비약");
    expect(html).toContain(">이벤트</span>");
    expect(html).toContain("사용 즉시 100레벨 달성");
  });

  it("보유한 숙련 증서를 소모품에서 사용할 수 있게 표시한다", () => {
    const onUseMasteryCertificate = vi.fn();
    const html = renderToStaticMarkup(
      <RareMapsTab
        materials={{}}
        spFruitUsed={{ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }}
        busy={null}
        onUseSpFruit={() => undefined}
        onUseEquipmentBox={() => undefined}
        onUseMasteryTome={() => undefined}
        masteryCertificates={10}
        onUseMasteryCertificate={onUseMasteryCertificate}
        rareMaps={[]}
        cashItems={{}}
        onUseCashItem={() => undefined}
        cookingFoods={{}}
        cookingFoodDefinitions={{}}
        onUseCookingFood={() => undefined}
        onUseExpTome={() => undefined}
        fishSpecimens={{}}
        registeredFishIds={[]}
        onUseFishSpecimen={() => undefined}
      />,
    );

    expect(html).toContain("숙련 증서 사용");
    expect(html).toContain("보유 10개");
    expect(html).toContain("직업 숙련도 또는 숙달 포인트");
    expect(html).toMatch(
      /rounded-xl border border-zinc-200 bg-white[^"<]*dark:bg-zinc-900/,
    );
    expect(html).toContain("dark:text-amber-300");
  });

  it("수행 초기화 물약은 레벨 1 경고를 확인한 뒤에만 사용한다", () => {
    const onUseCashItem = vi.fn();
    render(
      <RareMapsTab
        materials={{}}
        spFruitUsed={{ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }}
        busy={null}
        onUseSpFruit={() => undefined}
        onUseEquipmentBox={() => undefined}
        onUseMasteryTome={() => undefined}
        masteryCertificates={0}
        onUseMasteryCertificate={() => undefined}
        rareMaps={[]}
        cashItems={{ cultivation_reset_potion: 1 }}
        onUseCashItem={onUseCashItem}
        cookingFoods={{}}
        cookingFoodDefinitions={{}}
        onUseCookingFood={() => undefined}
        onUseExpTome={() => undefined}
        fishSpecimens={{}}
        registeredFishIds={[]}
        onUseFishSpecimen={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "사용" }));

    expect(onUseCashItem).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/레벨 1·경험치 0/)).toBeTruthy();
    expect(screen.getByText(/레벨 성장값은 사라집니다/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onUseCashItem).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "사용" }));
    fireEvent.click(
      screen.getByRole("button", { name: "수행 초기화 물약 사용 확정" }),
    );

    expect(onUseCashItem).toHaveBeenCalledOnce();
    expect(onUseCashItem).toHaveBeenCalledWith("cultivation_reset_potion");
  });
});
