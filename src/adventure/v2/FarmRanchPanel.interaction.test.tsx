// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FarmRanchPanel } from "./FarmRanchPanel";
import { emptyFarmState, FARM_CROP_REQUIRED_SKILL_ID } from "./farm";
import { unlockRanchSlot } from "./ranch";

afterEach(cleanup);

it("일괄 충전 요청을 보내고 진행 중에는 일괄·개별 사료 버튼을 잠근다", () => {
  const onFeed = vi.fn();
  const props = {
    farm: { ...emptyFarmState(1_000), inventory: { compound_feed: 10 } },
    now: 1_000,
    learnedSkillIds: [FARM_CROP_REQUIRED_SKILL_ID],
    busyCollect: false,
    busyUpgradeSlotId: null,
    busyRebuildSlotId: null,
    onFeed,
    onCollect: vi.fn(),
    onUpgrade: vi.fn(),
    onRebuild: vi.fn(),
    onOpenLifeWorkshop: vi.fn(),
  };
  const { rerender } = render(<FarmRanchPanel {...props} busyFeedSlotId={null} />);
  fireEvent.click(screen.getByRole("button", { name: "사료 모두 채우기" }));
  expect(onFeed).toHaveBeenCalledExactlyOnceWith("all", 0);

  rerender(<FarmRanchPanel {...props} busyFeedSlotId="all" />);
  const all = screen.getByRole("button", { name: "채우는 중..." });
  const single = screen.getByRole("button", { name: "사료 넣기" });
  expect((all as HTMLButtonElement).disabled).toBe(true);
  expect((single as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(all);
  fireEvent.click(single);
  expect(onFeed).toHaveBeenCalledTimes(1);

  rerender(<FarmRanchPanel {...props} busyFeedSlotId="slot-1" />);
  expect((screen.getByRole("button", { name: "사료 모두 채우기" }) as HTMLButtonElement).disabled).toBe(true);
});

it("부지 순서 버튼은 이웃한 동물 부지와 자리를 바꾸고 양 끝에서는 막힌다", () => {
  const onSwap = vi.fn();
  let ranch = emptyFarmState(1_000).ranch;
  ranch = unlockRanchSlot(ranch, "slot-2", "cow", 100, 1_000).ranch;
  render(
    <FarmRanchPanel
      farm={{ ...emptyFarmState(1_000), ranch }}
      now={1_000}
      learnedSkillIds={[FARM_CROP_REQUIRED_SKILL_ID]}
      busyFeedSlotId={null}
      busyCollect={false}
      busyUpgradeSlotId={null}
      busyRebuildSlotId={null}
      busySwap={false}
      onFeed={vi.fn()}
      onCollect={vi.fn()}
      onUpgrade={vi.fn()}
      onRebuild={vi.fn()}
      onSwap={onSwap}
      onOpenLifeWorkshop={vi.fn()}
    />,
  );
  expect((screen.getByRole("button", { name: "부지 1 앞으로" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "부지 2 뒤로" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "부지 2 앞으로" }));
  expect(onSwap).toHaveBeenCalledExactlyOnceWith("slot-2", "slot-1");
  fireEvent.click(screen.getByRole("button", { name: "부지 1 뒤로" }));
  expect(onSwap).toHaveBeenLastCalledWith("slot-1", "slot-2");
});
