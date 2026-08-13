import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  LIFE_REQUEST_BOARD_TABS,
  LifeRequestCard,
  WeeklyRequestChoiceSection,
  groupWeeklyRequestChoices,
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

  it("완료된 의뢰는 차감된 재료 현황 대신 완료 상태를 보여준다", () => {
    const html = renderToStaticMarkup(
      <LifeRequestCard
        request={{
          ...REQUEST,
          balance: 0,
          shortage: 10,
          completed: true,
        }}
        periodLimitReached={false}
        busy={false}
        onDeliver={vi.fn()}
      />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain("납품과 보상 수령을 완료했습니다.");
    expect(html).not.toContain("현재 보유");
    expect(html).not.toContain("10개 더 필요");
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain("벌목터에서 획득");
  });

  it("다른 주간 의뢰를 선택해 마감된 카드에 선택한 의뢰명을 보여준다", () => {
    const html = renderToStaticMarkup(
      <LifeRequestCard
        request={{ ...REQUEST, scope: "weekly" }}
        periodLimitReached
        closedByWeeklyRequestTitle="마을 행사 조리 지원"
        categoryLabel="전용 · 지미"
        busy={false}
        onDeliver={vi.fn()}
      />,
    );

    expect(html).toContain("전용 · 지미");
    expect(html).toContain("마을 행사 조리 지원");
    expect(html).toContain("다른 주간 의뢰 선택으로 마감");
    expect(html).not.toContain("납품 완료");
  });

  it("일반 의뢰와 해금된 전용 의뢰를 한 선택지로 묶고 잠긴 전용 의뢰는 분리한다", () => {
    const normal = { ...REQUEST, id: "weekly_normal", scope: "weekly" as const, title: "일반 대량 의뢰" };
    const unlockedSpecial = {
      ...REQUEST,
      id: "weekly_special_unlocked",
      scope: "weekly" as const,
      title: "해금된 전용 의뢰",
      requesterUnlocked: true,
    };
    const lockedSpecial = {
      ...REQUEST,
      id: "weekly_special_locked",
      scope: "weekly" as const,
      title: "잠긴 전용 의뢰",
      requesterUnlocked: false,
    };

    const grouped = groupWeeklyRequestChoices(
      [normal],
      [unlockedSpecial, lockedSpecial],
      [unlockedSpecial.id],
    );

    expect(grouped.available.map((request) => request.id)).toEqual([
      "weekly_normal",
      "weekly_special_unlocked",
    ]);
    expect(grouped.locked.map((request) => request.id)).toEqual([
      "weekly_special_locked",
    ]);
    expect(grouped.selected?.title).toBe("해금된 전용 의뢰");
  });

  it("주간 선택 영역에서 선택 결과와 잠긴 전용 의뢰를 함께 설명한다", () => {
    const normal = {
      ...REQUEST,
      id: "weekly_normal",
      scope: "weekly" as const,
      title: "마을 행사 조리 지원",
      completed: true,
    };
    const unlockedSpecial = {
      ...REQUEST,
      id: "weekly_special_unlocked",
      scope: "weekly" as const,
      title: "지미의 특별 주문",
      requesterUnlocked: true,
    };
    const lockedSpecial = {
      ...REQUEST,
      id: "weekly_special_locked",
      scope: "weekly" as const,
      title: "볼드의 특별 주문",
      requesterId: "blacksmith" as const,
      requesterUnlocked: false,
      requiredRequesterTrust: 15,
    };
    const html = renderToStaticMarkup(
      <WeeklyRequestChoiceSection
        normal={[normal]}
        special={[unlockedSpecial, lockedSpecial]}
        completedIds={[normal.id]}
        nextResetAt={1_800_000_000_000}
        busy={null}
        onDeliver={vi.fn()}
      />,
    );

    expect(html).toContain("이번 주 의뢰 선택");
    expect(html).toContain("마을 행사 조리 지원");
    expect(html).toContain("선택 완료");
    expect(html).toContain("일반 대량");
    expect(html).toContain("전용 · 나무꾼 지미");
    expect(html).toContain("다른 주간 의뢰 선택으로 마감");
    expect(html).toContain("잠긴 전용 의뢰 1개");
    expect(html).toContain("전용 · 대장장이 볼드");
  });
});
