// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HuntResultSheet } from "./HuntResultSheet";

afterEach(cleanup);

describe("사냥 결과 하단 시트", () => {
  it("접근 가능한 dialog와 내부 스크롤·안전 영역을 제공한다", () => {
    render(
      <HuntResultSheet open title="사냥 승리" onClose={vi.fn()} onRepeat={vi.fn()} onViewLog={vi.fn()}>
        <div>획득 아이템 없음</div>
      </HuntResultSheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "사냥 승리" });
    expect(dialog.className).toContain("max-h-[75dvh]");
    expect(dialog.className).toContain("pb-[max(1rem,env(safe-area-inset-bottom))]");
    expect(screen.getByText("획득 아이템 없음")).toBeTruthy();
  });

  it("닫기·Escape·다시 사냥·전투 기록 동작을 연결한다", () => {
    const onClose = vi.fn();
    const onRepeat = vi.fn();
    const onViewLog = vi.fn();
    render(
      <HuntResultSheet open title="전투 결과" onClose={onClose} onRepeat={onRepeat} onViewLog={onViewLog}>
        결과
      </HuntResultSheet>,
    );
    const repeat = screen.getByRole("button", { name: "다시 사냥" });
    const log = screen.getByRole("button", { name: "전투 기록 보기" });
    const close = screen.getByRole("button", { name: "결과 닫기" });
    expect(repeat.className).toContain("bg-violet-600");
    expect(log.className).toContain("bg-white");
    expect(close.className).toContain("size-11");
    fireEvent.click(repeat);
    fireEvent.click(log);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onRepeat).toHaveBeenCalledTimes(1);
    expect(onViewLog).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
