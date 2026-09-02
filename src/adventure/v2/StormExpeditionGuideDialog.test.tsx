// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StormExpeditionGuideDialog } from "./StormExpeditionGuideDialog";

afterEach(cleanup);

describe("폭풍 원정 도움말", () => {
  it("진행 규칙과 항로별 일반 장비 획득 위치를 안내한다", () => {
    render(<StormExpeditionGuideDialog open onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "폭풍 원정 도움말" });
    expect(dialog.textContent).toContain("심해 폐허 · 최심부");
    expect(dialog.textContent).toContain("하루 3회");
    expect(dialog.textContent).toContain("9개 체크포인트 · 7개 전투");
    expect(dialog.textContent).toContain("패배하면 임시 전리품을 모두 잃습니다");
    expect(dialog.textContent).toContain("잔해 항로의 모든 전투");
    expect(dialog.textContent).toContain("요새핵 반지");
    expect(dialog.textContent).toContain("칼바람 항로의 모든 전투");
    expect(dialog.textContent).toContain("질풍눈 반지");
    expect(dialog.textContent).toContain("뇌운 항로의 모든 전투");
    expect(dialog.textContent).toContain("낙뢰점 반지");
  });

  it("원정 전용 유니크의 장비명·드롭 지점·기본 확률을 안내한다", () => {
    render(<StormExpeditionGuideDialog open onClose={vi.fn()} />);

    const text = screen.getByRole("dialog", { name: "폭풍 원정 도움말" }).textContent;
    expect(text).toContain("부유성채의 동력갑");
    expect(text).toContain("해당 항로 수호자 3.00% · 폭풍의 심장 7.00%");
    expect(text).toContain("삼상 접속장갑");
    expect(text).toContain("폭풍의 심장 4.00%");
    expect(text).toContain("맥동하는 폭풍심장");
    expect(text).toContain("폭풍의 심장 1.00%");
  });

  it("닫기 버튼으로 모달을 닫는다", () => {
    const onClose = vi.fn();
    render(<StormExpeditionGuideDialog open onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "도움말 닫기" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
