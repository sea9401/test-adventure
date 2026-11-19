// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RanchLineageRow, ranchBreedNoticeText } from "./RanchLineageRow";

afterEach(cleanup);

const base = {
  slotLabel: "부지 2",
  animalId: "cow" as const,
  inventory: { milk: 45, compound_feed: 12 },
  context: { masterUnlocked: false, masterCropHeld: 0 },
  busy: false,
  anyBusy: false,
  onBreed: vi.fn(),
};

describe("RanchLineageRow", () => {
  it("혈통 등급과 희귀 산물 확률, 다음 교배의 성공률과 비용을 보여 준다", () => {
    render(<RanchLineageRow {...base} lineage={{ grade: 1, fails: 2 }} />);
    expect(screen.getByText("혈통 우량")).toBeTruthy();
    expect(screen.getByText("산물 +25%")).toBeTruthy();
    expect(screen.getByText("진한 우유 확률 10%")).toBeTruthy();
    expect(screen.getByText("교배 성공률 26%")).toBeTruthy();
    expect(screen.getByText("우유 45 / 30").className).not.toContain("rose");
    // 모자란 재료는 색으로 구분하고 교배를 막는다.
    expect(screen.getByText("배합 사료 12 / 20").className).toContain("rose");
    expect((screen.getByRole("button", { name: "부지 2 교배" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("재료가 충분하면 교배를 요청한다", () => {
    const onBreed = vi.fn();
    render(
      <RanchLineageRow
        {...base}
        inventory={{ milk: 30, compound_feed: 20 }}
        lineage={{ grade: 0, fails: 0 }}
        onBreed={onBreed}
      />,
    );
    expect(screen.getByText("혈통 보통")).toBeTruthy();
    expect(screen.getByText("교배 성공률 50%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "부지 2 교배" }));
    expect(onBreed).toHaveBeenCalledTimes(1);
  });

  it("명장 혈통 교배는 농사 주전공 조건을 알리고, 열리면 명장 작물까지 보여 준다", () => {
    const inventory = { milk: 90, compound_feed: 90 };
    const { rerender } = render(
      <RanchLineageRow {...base} inventory={inventory} lineage={{ grade: 3, fails: 0 }} />,
    );
    expect(screen.getByText("농사 주전공 명장 3단계부터 명장 혈통으로 교배할 수 있습니다.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "부지 2 교배" }) as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <RanchLineageRow
        {...base}
        inventory={inventory}
        lineage={{ grade: 3, fails: 0 }}
        context={{ masterUnlocked: true, masterCropHeld: 2 }}
      />,
    );
    expect(screen.getByText("명장 작물 2 / 2")).toBeTruthy();
    expect((screen.getByRole("button", { name: "부지 2 교배" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("최고 등급이면 교배 버튼 대신 최고 혈통이라고 알린다", () => {
    render(<RanchLineageRow {...base} lineage={{ grade: 4, fails: 0 }} />);
    expect(screen.getByText("혈통 명장 혈통")).toBeTruthy();
    expect(screen.getByText("진한 우유 확률 50%")).toBeTruthy();
    expect(screen.getByText("최고 혈통")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "부지 2 교배" })).toBeNull();
  });

  it("교배 결과를 한 문장으로 적는다", () => {
    const result = {
      slotId: "slot-1" as const,
      animalId: "chicken" as const,
      animalName: "닭",
      chancePct: 50,
      cost: { productItemId: "egg" as const, products: 60, feed: 20, masterCrop: 0 },
    };
    expect(ranchBreedNoticeText({ ...result, success: true, grade: 1, fails: 0 })).toBe(
      "닭 교배 성공: 혈통 우량. 산물 +25%, 황금 달걀 확률 10%.",
    );
    expect(ranchBreedNoticeText({ ...result, success: false, grade: 0, fails: 1 })).toBe(
      "닭 교배 실패: 혈통은 그대로이고 다음 성공률이 60%로 올랐습니다.",
    );
  });
});
