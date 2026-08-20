// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StormExpeditionAutoplayPlan } from "./stormExpeditionAutoplayPolicy";
import { StormExpeditionAutoPlanDialog } from "./StormExpeditionAutoPlanDialog";

const plan: StormExpeditionAutoplayPlan = {
  version: 1,
  mode: "normal",
  outerRouteId: "gale",
  middleRouteId: "thunder",
  guardianRouteId: "wreckage",
  boonStrategy: "offense",
};

describe("StormExpeditionAutoPlanDialog", () => {
  it("모드·세 구간 항로·축복 전략과 패배 경고를 한 번에 설정한다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionAutoPlanDialog
        open
        value={plan}
        attemptsLeft={2}
        busy={false}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain("일괄 진행 설정");
    expect(html).toContain("실전");
    expect(html).toContain("연습");
    expect(html).toContain("외곽 항로");
    expect(html).toContain("중층 항로");
    expect(html).toContain("수호자 항로");
    expect(html).toContain("칼바람");
    expect(html).toContain("뇌운");
    expect(html).toContain("잔해");
    expect(html).toContain("공격 우선");
    expect(html).toContain("생존 우선");
    expect(html).toContain("자원 우선");
    expect(html).toContain("패배하면 임시 전리품을 모두 잃으며 자동 귀환하지 않습니다.");
    expect(html).toContain("일괄 진행 시작");
    expect(html).toContain("min-h-11");
  });

  it("현재 계획을 aria-pressed로 표시한다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionAutoPlanDialog open value={plan} attemptsLeft={2} busy={false} onChange={vi.fn()} onSubmit={vi.fn()} onClose={vi.fn()} />,
    );
    expect(html).toMatch(/aria-label="외곽 항로 칼바람" aria-pressed="true"/);
    expect(html).toMatch(/aria-label="중층 항로 뇌운" aria-pressed="true"/);
    expect(html).toMatch(/aria-label="수호자 항로 잔해" aria-pressed="true"/);
    expect(html).toMatch(/aria-label="축복 전략 공격 우선" aria-pressed="true"/);
  });

  it("입장 횟수가 없으면 실전만 비활성화하고 연습은 유지한다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionAutoPlanDialog open value={plan} attemptsLeft={0} busy={false} onChange={vi.fn()} onSubmit={vi.fn()} onClose={vi.fn()} />,
    );
    expect(html).toMatch(/aria-label="실전 모드"[^>]* disabled=""/);
    expect(html).not.toMatch(/aria-label="연습 모드"[^>]* disabled=""/);
  });

  it("진행 중인 연습 원정에서는 연습 모드를 표시하고 모드 변경을 막는다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionAutoPlanDialog
        open
        value={plan}
        lockedMode="practice"
        attemptsLeft={2}
        busy={false}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toMatch(/aria-label="실전 모드" aria-pressed="false"[^>]* disabled=""/);
    expect(html).toMatch(/aria-label="연습 모드" aria-pressed="true"[^>]* disabled=""/);
    expect(html).toContain("진행 중인 원정에서는 모드를 변경할 수 없습니다.");
  });

  it("진행 중인 원정의 고정 모드를 제출 값에도 적용한다", () => {
    const onSubmit = vi.fn();
    render(
      <StormExpeditionAutoPlanDialog
        open
        value={plan}
        lockedMode="practice"
        attemptsLeft={2}
        busy={false}
        onChange={vi.fn()}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "일괄 진행 시작" }));

    expect(onSubmit).toHaveBeenCalledWith({ ...plan, mode: "practice" });
  });

  it("닫힌 상태에서는 아무것도 렌더하지 않는다", () => {
    expect(renderToStaticMarkup(
      <StormExpeditionAutoPlanDialog open={false} value={plan} attemptsLeft={2} busy={false} onChange={vi.fn()} onSubmit={vi.fn()} onClose={vi.fn()} />,
    )).toBe("");
  });
});
