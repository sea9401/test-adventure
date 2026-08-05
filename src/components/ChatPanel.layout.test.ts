import { describe, expect, it } from "vitest";
import {
  CHAT_CLOSE_BUTTON_CLASS,
  CHAT_HEADER_CLASS,
  CHAT_OVERLAY_CLASS,
  CHAT_PANEL_CLASS,
} from "./ChatPanel";

describe("ChatPanel responsive layout", () => {
  it("모바일에서는 전체 화면 최상위 레이어로 메뉴 입력을 차단한다", () => {
    expect(CHAT_OVERLAY_CLASS).toContain("pointer-events-auto");
    expect(CHAT_OVERLAY_CLASS).toContain("z-[55]");
    expect(CHAT_PANEL_CLASS).toContain("h-full");
    expect(CHAT_PANEL_CLASS).toContain("max-w-none");
    expect(CHAT_PANEL_CLASS).toContain("rounded-none");
    expect(CHAT_HEADER_CLASS).toContain("safe-area-inset-top");
    expect(CHAT_HEADER_CLASS).toContain("safe-area-inset-right");
    expect(CHAT_HEADER_CLASS).toContain("shrink-0");
    expect(CHAT_HEADER_CLASS).toContain("z-20");
    expect(CHAT_CLOSE_BUTTON_CLASS).toContain("shrink-0");
    expect(CHAT_CLOSE_BUTTON_CLASS).toContain("bg-zinc-100");
  });

  it("데스크톱에서는 기존 비모달 도킹과 크기를 유지한다", () => {
    expect(CHAT_OVERLAY_CLASS).toContain("sm:pointer-events-none");
    expect(CHAT_OVERLAY_CLASS).toContain("sm:z-[45]");
    expect(CHAT_PANEL_CLASS).toContain("sm:h-[680px]");
    expect(CHAT_PANEL_CLASS).toContain("sm:max-h-[90vh]");
    expect(CHAT_PANEL_CLASS).toContain("sm:max-w-xl");
    expect(CHAT_PANEL_CLASS).toContain("sm:rounded-xl");
  });
});
