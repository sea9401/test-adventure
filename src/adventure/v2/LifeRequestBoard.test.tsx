import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  LIFE_REQUEST_BOARD_TABS,
  LifeRequestCard,
  type LifeRequestView,
} from "./LifeRequestBoard";

const REQUEST: LifeRequestView = {
  id: "daily_willow",
  scope: "daily",
  grade: "normal",
  requesterId: "carpenter",
  lane: "woodcutting",
  activity: "woodcutting",
  title: "유연한 버드나무 주문",
  description: "바구니와 손잡이를 만들 버드나무 원목이 필요합니다.",
  itemName: "버드나무 원목",
  quantity: 10,
  balance: 7,
  shortage: 3,
  rewardGold: 1_600,
  rewardXp: 26,
  completed: false,
  unlocked: true,
  requesterUnlocked: true,
  chainLocked: false,
  trustGain: 1,
  source: { label: "벌목터에서 획득", workshopTab: "process" },
};

describe("생활 의뢰 정보 구조", () => {
  it("오늘·주간·의뢰인·기록을 각각 분리한다", () => {
    expect(LIFE_REQUEST_BOARD_TABS.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "daily", label: "오늘" },
      { id: "weekly", label: "주간" },
      { id: "requesters", label: "의뢰인" },
      { id: "records", label: "기록" },
    ]);
  });

  it("의뢰 카드에서 품목과 준비 진행도를 한 묶음으로 보여준다", () => {
    const html = renderToStaticMarkup(
      <LifeRequestCard
        request={REQUEST}
        periodLimitReached={false}
        busy={false}
        onDeliver={vi.fn()}
      />,
    );

    expect(html).toContain("납품 품목");
    expect(html).toContain("버드나무 원목 × 10");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemax="10"');
    expect(html).toContain('aria-valuenow="7"');
    expect(html).toContain("3개 더 필요");
    expect(html).toContain("life-workshop-touch-stack");
    expect(html).not.toContain(">보유<");
  });
});
