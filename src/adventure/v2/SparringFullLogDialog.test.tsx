// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SparringFullLogDialog } from "./SparringFullLogDialog";

afterEach(cleanup);

describe("허수아비 전체 전투 로그", () => {
  it("로그 본문 아래 버튼으로 모달을 닫는다", () => {
    const onClose = vi.fn();
    render(
      <SparringFullLogDialog
        entries={[]}
        playerName="모험가"
        enemyName="훈련용 허수아비"
        onClose={onClose}
      />,
    );

    const bottomClose = screen.getByRole("button", {
      name: "전체 전투 로그 하단에서 닫기",
    });
    fireEvent.click(bottomClose);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
