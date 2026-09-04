// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxItem } from "@/adventure/marketplace/api";
import { RewardToastProvider } from "./RewardToastProvider";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  deleteReceivedInbox: vi.fn(),
  fetchInbox: vi.fn(),
}));

vi.mock("@/components/ui/gameDialog", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/components/ui/gameDialog")
  >();
  return { ...actual, confirmGameAction: mocks.confirm };
});

vi.mock("@/adventure/marketplace/api", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/adventure/marketplace/api")
  >();
  return {
    ...actual,
    deleteReceivedInbox: mocks.deleteReceivedInbox,
    fetchInbox: mocks.fetchInbox,
  };
});

vi.mock("./GameStateProvider", () => ({
  useGameState: () => ({
    applyResourcePatch: vi.fn(),
    refreshGameState: vi.fn(),
    refreshGuildId: vi.fn(),
  }),
}));

import { V2InboxView } from "./V2InboxView";

const completedMail: InboxItem = {
  id: 7,
  kind: "user_message",
  payload: { text: "정리할 완료 쪽지" },
  message: null,
  listingId: null,
  fromName: "보낸사람",
  fromUserId: "u2",
  recipientName: "받는사람",
  direction: "received",
  createdAt: "2026-09-04T08:00:00.000Z",
  readAt: "2026-09-04T08:01:00.000Z",
  claimedAt: "2026-09-04T08:01:00.000Z",
  hasReward: false,
  claimState: "none",
};

function renderInbox() {
  return render(
    <RewardToastProvider>
      <V2InboxView embedded />
    </RewardToastProvider>,
  );
}

beforeEach(() => {
  mocks.confirm.mockReset();
  mocks.deleteReceivedInbox.mockReset();
  mocks.fetchInbox.mockReset();
  mocks.fetchInbox.mockResolvedValue({
    items: [completedMail],
    unreadCount: 0,
  });
  mocks.deleteReceivedInbox.mockResolvedValue({
    ok: true,
    deletedAt: "2026-09-04T09:30:00.000Z",
  });
});

afterEach(() => {
  cleanup();
});

describe("받은 우편 삭제 흐름", () => {
  it("삭제를 취소하면 완료 우편을 그대로 유지한다", async () => {
    mocks.confirm.mockResolvedValue(false);
    renderInbox();
    await screen.findByText("정리할 완료 쪽지");

    fireEvent.click(
      screen.getByRole("button", { name: "보낸사람님의 쪽지 삭제" }),
    );

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
    expect(screen.getByText("정리할 완료 쪽지")).not.toBeNull();
    expect(mocks.deleteReceivedInbox).not.toHaveBeenCalled();
  });

  it("상세창에서 삭제하면 모달과 받은 우편 행을 제거하고 알림을 갱신한다", async () => {
    mocks.confirm.mockResolvedValue(true);
    const onInboxRefresh = vi.fn();
    window.addEventListener("v2inbox:refresh", onInboxRefresh);
    renderInbox();
    await screen.findByText("정리할 완료 쪽지");
    onInboxRefresh.mockClear();

    fireEvent.click(screen.getByText("정리할 완료 쪽지"));
    expect(screen.getByRole("dialog")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "우편 삭제" }));

    await waitFor(() => {
      expect(screen.queryByText("정리할 완료 쪽지")).toBeNull();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getAllByText("우편을 삭제했어요.").length).toBeGreaterThan(0);
    expect(onInboxRefresh).toHaveBeenCalledTimes(1);
    window.removeEventListener("v2inbox:refresh", onInboxRefresh);
  });

  it("삭제 요청이 실패하면 우편을 유지하고 오류를 안내한다", async () => {
    mocks.confirm.mockResolvedValue(true);
    mocks.deleteReceivedInbox.mockRejectedValue(
      new Error("우편 삭제 실패 (500)"),
    );
    renderInbox();
    await screen.findByText("정리할 완료 쪽지");

    fireEvent.click(
      screen.getByRole("button", { name: "보낸사람님의 쪽지 삭제" }),
    );

    expect(await screen.findByText("우편 삭제 실패 (500)")).not.toBeNull();
    expect(screen.getByText("정리할 완료 쪽지")).not.toBeNull();
  });
});
