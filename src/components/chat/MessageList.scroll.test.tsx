// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../ChatPanel";
import { MessageList } from "./MessageList";

const message: ChatMessage = {
  id: 1,
  channel: "global",
  name: "모험가",
  className: "전사",
  title: null,
  content: "첫 메시지",
  createdAt: Date.now(),
  mine: false,
};

afterEach(cleanup);

function renderScrollableList() {
  const view = render(
    <MessageList open tab="chat" messages={[message]} onSelectName={vi.fn()} />,
  );
  const list = view.container.firstElementChild as HTMLDivElement;
  let scrollHeight = 1000;
  let clientHeight = 450;
  Object.defineProperties(list, {
    scrollHeight: { get: () => scrollHeight },
    clientHeight: { get: () => clientHeight },
  });
  list.scrollTop = 550;
  fireEvent.scroll(list);

  return {
    list,
    setHeight: (height: number) => {
      clientHeight = height;
    },
    addMessage: () => {
      scrollHeight = 1100;
      view.rerender(
        <MessageList
          open
          tab="chat"
          messages={[message, { ...message, id: 2, content: "새 메시지" }]}
          onSelectName={vi.fn()}
        />,
      );
    },
  };
}

describe("MessageList 자동 스크롤", () => {
  it("화면 높이가 줄어도 보고 있던 최신 메시지를 계속 따라간다", () => {
    const { list, setHeight, addMessage } = renderScrollableList();

    // 모바일 키보드가 열리면 scrollTop은 그대로인데 보이는 높이만 줄어든다.
    setHeight(300);
    fireEvent.scroll(list);
    fireEvent.scroll(list);
    addMessage();

    expect(list.scrollTop).toBe(1100);
  });

  it("사용자가 위로 스크롤했다면 새 메시지가 와도 읽는 위치를 지킨다", () => {
    const { list, addMessage } = renderScrollableList();

    list.scrollTop = 200;
    fireEvent.scroll(list);
    addMessage();

    expect(list.scrollTop).toBe(200);
  });
});
