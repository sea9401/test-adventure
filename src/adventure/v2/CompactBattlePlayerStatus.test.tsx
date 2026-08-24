// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { CompactBattlePlayerStatus } from "./CompactBattlePlayerStatus";

describe("사냥터 캐릭터 정보", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("상세 정보를 열지 않아도 HP·MP 충전약 잔량을 보여준다", () => {
    const html = renderToStaticMarkup(
      <CompactBattlePlayerStatus
        name="모험가"
        hp={{ hp: 120, maxHp: 200 }}
        mp={{ mp: 30, maxMp: 50 }}
        exp={40}
        maxExp={100}
        hpCharges={17}
        mpCharges={9}
      >
        <div>펼친 상세 정보</div>
      </CompactBattlePlayerStatus>,
    );

    const summary = html.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1];

    expect(summary).toContain("HP 충전약 17");
    expect(summary).toContain("MP 충전약 9");
  });

  it("저장된 선택이 없으면 상세 정보를 펼친 상태로 시작한다", () => {
    const { container } = renderPlayerStatus();

    expect(container.querySelector("details")?.open).toBe(true);
  });

  it("마지막 접기·펼치기 상태를 사냥터에 다시 들어왔을 때 복원한다", async () => {
    const first = renderPlayerStatus();
    const summary = first.container.querySelector("summary");
    if (!summary) throw new Error("summary not found");

    fireEvent.click(summary);
    expect(first.container.querySelector("details")?.open).toBe(false);
    await waitFor(() => expect(localStorage.length).toBe(1));
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
    >
      <div>펼친 상세 정보</div>
    </CompactBattlePlayerStatus>,
  );
}
