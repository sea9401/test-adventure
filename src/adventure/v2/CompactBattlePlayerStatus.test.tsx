// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { CompactBattlePlayerStatus } from "./CompactBattlePlayerStatus";

describe("사냥터 캐릭터 정보", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("상세 정보를 접으면 숙련도와 HP·MP 충전약 잔량을 고정된 줄로 보여준다", async () => {
    const { container } = render(
      <CompactBattlePlayerStatus
        name="모험가"
        subtitle="전투 Lv.100 / 100 · 바람 마법사"
        hp={{ hp: 120, maxHp: 200 }}
        mp={{ mp: 30, maxMp: 50 }}
        exp={40}
        maxExp={100}
        hpCharges={17}
        mpCharges={9}
        proficiency={7_562}
      >
        <div>펼친 상세 정보</div>
      </CompactBattlePlayerStatus>,
    );

    const summary = container.querySelector("summary");
    if (!summary) throw new Error("summary not found");
    fireEvent.click(summary);
    await waitFor(() =>
      expect(container.querySelector("details")?.open).toBe(false),
    );

    expect(summary.textContent).toContain("HP 충전약 17");
    expect(summary.textContent).toContain("MP 충전약 9");
    expect(summary.textContent).toContain("직업 숙련도 7,562");
    expect(summary.querySelectorAll("[data-recovery-charge]")).toHaveLength(2);
    expect(summary.querySelector('[data-recovery-charge="hp"]')).not.toBeNull();
    expect(summary.querySelector('[data-recovery-charge="mp"]')).not.toBeNull();
    expect(summary.innerHTML).toContain("text-[15px]");
    expect(summary.innerHTML).toContain("text-[12px]");
  });

  it("MP를 사용하지 않는 캐릭터는 접힌 요약에 HP 충전약 한 줄만 보여준다", async () => {
    const { container } = render(
      <CompactBattlePlayerStatus
        name="전사"
        hp={{ hp: 120, maxHp: 200 }}
        exp={40}
        maxExp={100}
        hpCharges={17}
        mpCharges={9}
      >
        <div>펼친 상세 정보</div>
      </CompactBattlePlayerStatus>,
    );

    const summary = container.querySelector("summary");
    if (!summary) throw new Error("summary not found");
    fireEvent.click(summary);
    await waitFor(() =>
      expect(container.querySelector("details")?.open).toBe(false),
    );

    expect(summary.querySelectorAll("[data-recovery-charge]")).toHaveLength(1);
    expect(summary.querySelector('[data-recovery-charge="hp"]')).not.toBeNull();
    expect(summary.querySelector('[data-recovery-charge="mp"]')).toBeNull();
  });

  it("저장된 선택이 없으면 상세 정보를 펼친 상태로 시작한다", () => {
    const { container } = renderPlayerStatus();

    expect(container.querySelector("details")?.open).toBe(true);
    expect(container.querySelector("summary")?.textContent).toContain(
      "간략히 보기",
    );
  });

  it("상세 정보를 펼치면 상세 카드와 겹치는 상단 요약을 숨긴다", () => {
    const { container } = renderPlayerStatus();
    const summary = container.querySelector("summary");

    expect(summary?.textContent).toBe("간략히 보기");
  });

  it("마지막 접기·펼치기 상태를 사냥터에 다시 들어왔을 때 복원한다", async () => {
    const first = renderPlayerStatus();
    const summary = first.container.querySelector("summary");
    if (!summary) throw new Error("summary not found");

    fireEvent.click(summary);
    expect(first.container.querySelector("details")?.open).toBe(false);
    await waitFor(() => {
      expect(summary.textContent).toContain("상세 보기");
      expect(localStorage.length).toBe(1);
    });
    first.unmount();

    const second = renderPlayerStatus();
    expect(second.container.querySelector("details")?.open).toBe(false);

    const secondSummary = second.container.querySelector("summary");
    const storageKey = localStorage.key(0);
    if (!secondSummary || !storageKey) throw new Error("persisted state not found");
    fireEvent.click(secondSummary);
    await waitFor(() =>
      expect(localStorage.getItem(storageKey)).toBe("true"),
    );
    second.unmount();

    const third = renderPlayerStatus();
    expect(third.container.querySelector("details")?.open).toBe(true);
  });
});

function renderPlayerStatus() {
  return render(
    <CompactBattlePlayerStatus
      name="모험가"
      hp={{ hp: 120, maxHp: 200 }}
      mp={{ mp: 30, maxMp: 50 }}
      exp={40}
      maxExp={100}
      hpCharges={17}
      mpCharges={9}
      proficiency={7_562}
    >
      <div>펼친 상세 정보</div>
    </CompactBattlePlayerStatus>,
  );
}
