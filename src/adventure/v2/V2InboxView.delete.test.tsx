// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxItem } from "@/adventure/marketplace/api";
import { RewardToastProvider } from "./RewardToastProvider";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  deleteReceivedInbox: vi.fn(),
  deleteCompletedInbox: vi.fn(),
  fetchInbox: vi.fn(),
  fetchInboxSent: vi.fn(),
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
    deleteCompletedInbox: mocks.deleteCompletedInbox,
    fetchInbox: mocks.fetchInbox,
    fetchInboxSent: mocks.fetchInboxSent,
  };
});

vi.mock("./GameResourceContext", () => ({
  useGameResourceState: () => ({
    applyResourcePatch: vi.fn(),
  }),
}));
vi.mock("./GameWorldContext", () => ({
  useGameWorldState: () => ({ refreshGuildId: vi.fn() }),
}));
vi.mock("./GameStateRefreshContext", () => ({
  useRefreshGameState: () => vi.fn(),
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
  mocks.deleteCompletedInbox.mockReset().mockResolvedValue({ ok: true, deletedIds: [7] });
  mocks.fetchInboxSent.mockReset().mockResolvedValue({ items: [], unreadCount: 0 });
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

describe("완료 우편 일괄 삭제 흐름", () => {
  it("확인을 취소하면 우편을 유지하고 삭제하지 않는다", async () => {
    mocks.confirm.mockResolvedValue(false);
    renderInbox();
    await screen.findByText("정리할 완료 쪽지");
    fireEvent.click(screen.getByRole("button", { name: "완료 우편 일괄 삭제" }));

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining("읽지 않았거나 수령·처리를 마치지 않은 우편은 남겨둡니다."),
    }));
    expect(mocks.deleteCompletedInbox).not.toHaveBeenCalled();
    expect(screen.getByText("정리할 완료 쪽지")).not.toBeNull();
  });

  it("서버가 삭제한 우편만 제거하고 미확인·미수령·미응답 우편을 남긴다", async () => {
    const remaining: InboxItem[] = [
      { ...completedMail, id: 8, payload: { text: "미확인 쪽지" }, readAt: null, claimedAt: null },
      { ...completedMail, id: 9, kind: "admin_gift", message: "미수령 보상", payload: { gold: 10 }, claimedAt: null, hasReward: true, claimState: "claimable" },
      { ...completedMail, id: 10, kind: "guild_invite", payload: { guild_name: "대기중", invite_id: 1 }, claimedAt: null, claimState: "action" },
      { ...completedMail, id: 11, payload: { text: "수령했지만 읽지 않은 우편" }, readAt: null },
    ];
    mocks.fetchInbox.mockResolvedValueOnce({ items: [completedMail, ...remaining], unreadCount: 2 });
    mocks.fetchInbox.mockResolvedValue({ items: remaining, unreadCount: 2 });
    mocks.confirm.mockResolvedValue(true);
    const onRefresh = vi.fn();
    window.addEventListener("v2inbox:refresh", onRefresh);
    try {
      renderInbox();
      await screen.findByText("정리할 완료 쪽지");
      onRefresh.mockClear();
      fireEvent.click(screen.getByText("정리할 완료 쪽지"));
      fireEvent.click(screen.getByRole("button", { name: "완료 우편 일괄 삭제" }));

      await waitFor(() => expect(screen.queryByText("정리할 완료 쪽지")).toBeNull());
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByText("미확인 쪽지")).not.toBeNull();
      expect(screen.getByText("미수령 보상")).not.toBeNull();
      expect(screen.getByText("대기중 길드에서 초대했어요.")).not.toBeNull();
      expect(screen.getByText("수령했지만 읽지 않은 우편")).not.toBeNull();
      expect(screen.getAllByText("완료 우편 1개를 삭제했어요.").length).toBeGreaterThan(0);
      expect(mocks.fetchInbox).toHaveBeenCalledTimes(2);
      expect(onRefresh).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("v2inbox:refresh", onRefresh);
    }
  });

  it("삭제 요청이 실패하면 현재 우편을 유지하고 오류를 표시한다", async () => {
    mocks.confirm.mockResolvedValue(true);
    mocks.deleteCompletedInbox.mockRejectedValue(new Error("우편 삭제 실패 (500)"));
    renderInbox();
    await screen.findByText("정리할 완료 쪽지");
    fireEvent.click(screen.getByRole("button", { name: "완료 우편 일괄 삭제" }));

    expect(await screen.findByText("우편 삭제 실패 (500)")).not.toBeNull();
    expect(screen.getByText("정리할 완료 쪽지")).not.toBeNull();
    expect(mocks.fetchInbox).toHaveBeenCalledTimes(1);
  });

  it("표시된 완료 우편이 없어도 서버의 오래된 완료 기록을 정리할 수 있다", async () => {
    mocks.fetchInbox.mockResolvedValue({ items: [], unreadCount: 0 });
    mocks.confirm.mockResolvedValue(true);
    mocks.deleteCompletedInbox.mockResolvedValue({ ok: true, deletedIds: [] });
    renderInbox();
    await screen.findByText("받은 우편이 없어요.");
    fireEvent.click(screen.getByRole("button", { name: "완료 우편 일괄 삭제" }));

    await waitFor(() => {
      expect(screen.getAllByText("삭제할 완료 우편이 없어요.").length).toBeGreaterThan(0);
    });
    expect(mocks.deleteCompletedInbox).toHaveBeenCalledTimes(1);
  });

  it("확인과 삭제 요청 중에는 중복 삭제를 막고 완료 후 버튼을 복구한다", async () => {
    let confirm!: (value: boolean) => void;
    let finish!: (value: { ok: true; deletedIds: number[] }) => void;
    mocks.confirm.mockReturnValue(new Promise<boolean>((resolve) => { confirm = resolve; }));
    mocks.deleteCompletedInbox.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    mocks.fetchInbox.mockResolvedValueOnce({ items: [completedMail], unreadCount: 0 });
    mocks.fetchInbox.mockResolvedValue({ items: [], unreadCount: 0 });
    renderInbox();
    await screen.findByText("정리할 완료 쪽지");
    const button = screen.getByRole("button", { name: "완료 우편 일괄 삭제" }) as HTMLButtonElement;
    fireEvent.click(button);
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    confirm(true);
    await waitFor(() => expect(mocks.deleteCompletedInbox).toHaveBeenCalledTimes(1));
    expect(button.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "보낸사람님의 쪽지 삭제" }) as HTMLButtonElement).disabled).toBe(true);
    finish({ ok: true, deletedIds: [7] });
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it("보낸 우편 탭에는 일괄 삭제 버튼이 없다", async () => {
    renderInbox();
    await screen.findByText("정리할 완료 쪽지");
    fireEvent.click(screen.getByRole("button", { name: "보낸 우편" }));
    await screen.findByText("보낸 우편 기록이 없어요.");
    expect(screen.queryByRole("button", { name: "완료 우편 일괄 삭제" })).toBeNull();
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
