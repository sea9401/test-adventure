// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchComments: vi.fn(async () => []),
  postComment: vi.fn(),
  deleteComment: vi.fn(),
}));

vi.mock("./api", () => mocks);

import { CommentsPanel } from "./CommentsPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("댓글 입력창", () => {
  it("400자를 입력할 수 있고 작성 내용을 3줄 높이로 보여준다", async () => {
    render(
      <CommentsPanel
        postId={7}
        onCountChange={vi.fn()}
        onTargetMessage={vi.fn()}
      />,
    );
    await screen.findByText("아직 댓글이 없습니다.");

    const textarea = screen.getByPlaceholderText("댓글 달기") as HTMLTextAreaElement;
    expect(textarea.maxLength).toBe(400);
    expect(textarea.rows).toBe(3);

    fireEvent.change(textarea, { target: { value: "가".repeat(400) } });

    expect(screen.getByText("400 / 400")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "등록" }).hasAttribute("disabled"),
    ).toBe(false);
  });
});
