import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../ChatPanel";
import { MessageList } from "./MessageList";

const message: ChatMessage = {
  id: 1,
  channel: "global",
  name: "시스템",
  className: "협동 보스",
  title: null,
  content: "태고의 노룡이 깨어났습니다.",
  createdAt: Date.now(),
  mine: false,
};

describe("MessageList", () => {
  it("일반 채팅 본문을 들여쓰기 없이 두 줄로 표시한다", () => {
    const html = renderToStaticMarkup(
      <MessageList
        open
        tab="chat"
        messages={[message]}
        onSelectName={vi.fn()}
      />,
    );

    expect(html).toContain("whitespace-pre-wrap break-words leading-relaxed");
    expect(html).not.toContain("pl-2");
  });

  it("시스템 알림의 이름·시간·내용을 한 줄에 표시한다", () => {
    const html = renderToStaticMarkup(
      <MessageList
        open
        tab="notice"
        messages={[message]}
        onSelectName={vi.fn()}
      />,
    );

    expect(html).toContain(
      "flex min-w-0 items-baseline overflow-hidden whitespace-nowrap leading-relaxed",
    );
    expect(html).toContain("ml-1.5 min-w-0 truncate");
    expect(html).not.toContain("whitespace-pre-wrap");
  });
});
