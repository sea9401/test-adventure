// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoinConsumableShopList } from "./CoinShopLists";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const potion = {
  itemId: "stamina_potion",
  name: "스태미나 회복약",
  description: "회복",
  price: 200,
  maxQuantity: 30,
};

function renderList(
  overrides: Partial<typeof potion> = {},
  coins = 100_000,
  onBuyConsumable = vi.fn(async () => undefined),
) {
  render(
    <CoinConsumableShopList
      consumables={[{ ...potion, ...overrides }]}
      coins={coins}
      staminaPotions={0}
      buying={null}
      onBuyConsumable={onBuyConsumable}
      accent="sky"
    />,
  );
  return onBuyConsumable;
}

describe("CoinConsumableShopList 수량 입력", () => {
  it("입력한 수량을 한 번에 구매하고 버튼에 합계 코인을 보여 준다", async () => {
    const onBuy = renderList();

    fireEvent.change(screen.getByLabelText("스태미나 회복약 수량"), {
      target: { value: "12" },
    });
    expect(screen.getByRole("button", { name: /2,400/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /2,400/ }));

    await waitFor(() =>
      expect(onBuy).toHaveBeenCalledWith("stamina_potion", 12),
    );
    expect(onBuy).toHaveBeenCalledTimes(1);
  });

  it("최대 버튼은 남은 횟수와 코인 중 작은 값을 고른다", () => {
    renderList({}, 200 * 7);

    fireEvent.click(screen.getByRole("button", { name: "최대 7개" }));

    expect(
      (screen.getByLabelText("스태미나 회복약 수량") as HTMLInputElement).value,
    ).toBe("7");
  });

  it("구매한 뒤 수량을 1로 되돌려 다시 눌러도 많이 사지 않게 한다", async () => {
    renderList();

    fireEvent.change(screen.getByLabelText("스태미나 회복약 수량"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: /2,400/ }));

    await waitFor(() =>
      expect(
        (screen.getByLabelText("스태미나 회복약 수량") as HTMLInputElement).value,
      ).toBe("1"),
    );
  });

  it("1개만 살 수 있거나 수량을 지원하지 않는 상품은 입력칸을 숨긴다", () => {
    renderList({}, 200);
    expect(screen.queryByLabelText("스태미나 회복약 수량")).toBeNull();
    cleanup();

    renderList({ maxQuantity: undefined });
    expect(screen.queryByLabelText("스태미나 회복약 수량")).toBeNull();
  });
});

describe("CoinConsumableShopList 수량 표시", () => {
  it("입력 중에 최대를 눌러도 입력칸이 실제 수량을 보여 준다", () => {
    renderList();
    const input = () =>
      screen.getByLabelText("스태미나 회복약 수량") as HTMLInputElement;

    fireEvent.change(input(), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "최대 30개" }));

    expect(input().value).toBe("30");
    expect(screen.getByRole("button", { name: /6,000/ })).toBeTruthy();
  });
});
