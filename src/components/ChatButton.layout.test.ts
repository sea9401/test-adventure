// @vitest-environment jsdom

import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChatButton } from "./ChatButton";

vi.mock("next/dynamic", () => ({
  default: () =>
    function FakeChatPanel({
      open,
      onClose,
    }: {
      open: boolean;
      onClose: () => void;
    }) {
      return open
        ? createElement("button", { onClick: onClose }, "패널 닫기")
        : null;
    },
}));

vi.mock("./chat/chatMessagesApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./chat/chatMessagesApi")>();
  return {
    ...actual,
    fetchMainChatMessages: vi.fn(
      () => new Promise<never>(() => undefined),
    ),
  };
});

const props = {
  name: "테스터",
  className: "전사",
  title: null,
  viewerGuildId: null,
};

afterEach(cleanup);

describe("ChatButton toggle visibility", () => {
  it("채팅이 열려 있는 동안 플로팅 토글을 제거하고 닫히면 복원한다", () => {
    render(createElement(ChatButton, { ...props, variant: "floating" }));

    fireEvent.click(screen.getByTestId("floating-chat-toggle"));

    expect(screen.queryByTestId("floating-chat-toggle")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "패널 닫기" }));

    expect(screen.getByTestId("floating-chat-toggle")).toBeTruthy();
  });

  it("인라인 토글은 채팅이 열려도 닫기 버튼으로 유지한다", () => {
    render(createElement(ChatButton, props));

    fireEvent.click(screen.getByRole("button", { name: "채팅 열기" }));

    expect(screen.getByRole("button", { name: "채팅 닫기" })).toBeTruthy();
  });
});
