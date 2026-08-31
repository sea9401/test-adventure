// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GameDialogHost } from "./GameDialogHost";
import { confirmGameAction, showGameAlert } from "./gameDialog";

afterEach(cleanup);

describe("GameDialogHost", () => {
  it("불투명 공용 표면과 모바일 안전 영역을 사용한다", async () => {
    render(<GameDialogHost />);

    const acknowledged = showGameAlert("수확할 작물이 없습니다.");
    const dialog = await screen.findByRole("dialog", { name: "안내" });
    const message = screen.getByText("수확할 작물이 없습니다.");

    expect(dialog.className).toContain("bg-white");
    expect(dialog.className).toContain(
      "pb-[max(1rem,env(safe-area-inset-bottom))]",
    );
    expect(message.className).toContain("bg-zinc-50");

    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    await expect(acknowledged).resolves.toBeUndefined();
  });

  it("브라우저 창 대신 앱 모달에서 승인과 취소 결과를 돌려준다", async () => {
    render(<GameDialogHost />);

    const cancelled = confirmGameAction({
      title: "장비 판매",
      message: "철검을 판매할까요?",
      confirmLabel: "판매",
      tone: "danger",
    });
    expect(await screen.findByRole("dialog", { name: "장비 판매" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await expect(cancelled).resolves.toBe(false);

    const approved = confirmGameAction("계속 진행할까요?");
    expect(await screen.findByText("계속 진행할까요?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    await expect(approved).resolves.toBe(true);
  });

  it("안내는 확인 버튼 하나만 표시하고 닫힐 때까지 기다린다", async () => {
    render(<GameDialogHost />);

    const acknowledged = showGameAlert("다시 시도해 주세요.");
    expect(await screen.findByRole("dialog", { name: "안내" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "취소" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    await expect(acknowledged).resolves.toBeUndefined();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("겹쳐 들어온 요청을 FIFO 순서로 한 건씩 표시한다", async () => {
    render(<GameDialogHost />);

    const first = confirmGameAction({ title: "첫 번째", message: "첫 요청" });
    const second = confirmGameAction({ title: "두 번째", message: "둘째 요청" });

    expect(await screen.findByRole("dialog", { name: "첫 번째" })).toBeTruthy();
    expect(screen.queryByText("둘째 요청")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    await expect(first).resolves.toBe(true);

    expect(await screen.findByRole("dialog", { name: "두 번째" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await expect(second).resolves.toBe(false);
  });
});
