// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";

const api = vi.hoisted(() => ({
  adminGet: vi.fn(),
  adminPost: vi.fn(),
}));

const admin = vi.hoisted(() => ({
  value: {
    showToast: vi.fn(),
    adminMe: {
      capabilities: { read: true, reward: true, sanction: true, super: true },
    },
  },
}));

vi.mock("../../api", () => api);
vi.mock("../../AdminContext", () => ({
  useAdmin: () => admin.value,
}));

import { SanctionsSection } from "./SanctionsSection";

const activeStatus = {
  ok: true,
  banned: true,
  bannedUntil: "9999-12-31T00:00:00.000Z",
  banReason: "계정 조사 중",
  permanent: true,
  trade: {
    suspended: true,
    suspendedUntil: "2026-08-27T12:00:00.000Z",
    reason: "거래 조작 조사 중",
    permanent: false,
  },
  sanctions: [],
};

const historyStatus = {
  ...activeStatus,
  sanctions: [
    {
      id: 1,
      type: "ban",
      reason: "계정 이력 사유",
      expiresAt: null,
      createdByEmail: "admin@example.com",
      createdAt: "2026-08-20T12:00:00.000Z",
      acknowledgedAt: null,
      liftedAt: null,
      liftedByEmail: null,
    },
    {
      id: 2,
      type: "trade_suspend",
      reason: "거래 이력 사유",
      expiresAt: "2026-08-27T12:00:00.000Z",
      createdByEmail: "admin@example.com",
      createdAt: "2026-08-20T12:00:00.000Z",
      acknowledgedAt: null,
      liftedAt: null,
      liftedByEmail: null,
    },
  ],
};

describe("SanctionsSection 거래 제재", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    admin.value = {
      showToast: vi.fn(),
      adminMe: {
        capabilities: { read: true, reward: true, sanction: true, super: true },
      },
    };
    api.adminGet.mockResolvedValue(activeStatus);
    api.adminPost.mockResolvedValue({ ok: true });
  });

  it("계정 제재와 독립된 거래 제재 상태·기간 프리셋·불투명 표면을 표시한다", async () => {
    const { container } = render(
      <SanctionsSection userId="target-user" readOnly={false} />,
    );

    await screen.findByText("거래 제재");

    expect(screen.getByText(/영구 밴 중.*계정 조사 중/)).toBeDefined();
    expect(screen.getByText(/거래 정지 중.*거래 조작 조사 중/)).toBeDefined();
    expect(screen.getByRole("button", { name: "1일 거래 정지" })).toBeDefined();
    expect(screen.getByRole("button", { name: "3일 거래 정지" })).toBeDefined();
    expect(screen.getByRole("button", { name: "7일 거래 정지" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "영구 거래 정지" }),
    ).toBeDefined();
    expect(container.innerHTML).toContain(SURFACE_CARD.split(" ")[0]);
    expect(container.innerHTML).toContain(SURFACE_INSET.split(" ")[0]);
    expect(container.innerHTML).toContain("bg-white");
    expect(container.innerHTML).toContain("dark:bg-zinc-900");
  });

  it("거래 제재 해제는 계정 제재와 무관하게 trade 범위로 전송한다", async () => {
    render(<SanctionsSection userId="target-user" readOnly={false} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "거래 제재 해제" }),
    );

    await waitFor(() => {
      expect(api.adminPost).toHaveBeenCalledWith(
        "/api/admin/sanctions",
        expect.objectContaining({
          userId: "target-user",
          scope: "trade",
          action: "lift",
        }),
      );
    });
    expect(api.adminPost).not.toHaveBeenCalledWith(
      "/api/admin/sanctions",
      expect.objectContaining({ scope: "account", action: "lift" }),
    );
  });

  it("계정과 거래 이력을 각 카드에 한 번씩만 표시한다", async () => {
    api.adminGet.mockResolvedValue(historyStatus);
    render(<SanctionsSection userId="target-user" readOnly={false} />);

    const accountCard = (
      await screen.findByRole("heading", {
        name: "제재 (밴 / 정지 / 경고)",
      })
    ).closest("section");
    const tradeCard = screen
      .getByRole("heading", { name: "거래 제재" })
      .closest("section");

    expect(accountCard?.textContent).toContain("계정 이력 사유");
    expect(accountCard?.textContent).not.toContain("거래 이력 사유");
    expect(tradeCard?.textContent).toContain("거래 이력 사유");
    expect(tradeCard?.textContent).not.toContain("계정 이력 사유");
  });

  it("거래 기간 정지는 프리셋 사유와 기간을 trade 범위로 전송한다", async () => {
    render(<SanctionsSection userId="target-user" readOnly={false} />);

    fireEvent.change(screen.getByPlaceholderText("유저 노출 사유"), {
      target: { value: "계정 전용 사유" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "3일 거래 정지" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "기간 거래 정지" }));
    fireEvent.change(screen.getByPlaceholderText("TRADE SUSPEND"), {
      target: { value: "TRADE SUSPEND" },
    });
    fireEvent.click(screen.getByRole("button", { name: "실행" }));

    await waitFor(() => {
      expect(api.adminPost).toHaveBeenCalledWith(
        "/api/admin/sanctions",
        expect.objectContaining({
          userId: "target-user",
          scope: "trade",
          action: "suspend",
          days: 3,
          reason:
            "거래 이용 정책 위반이 반복되어 3일 거래 정지가 적용되었습니다.",
        }),
      );
    });
  });

  it("영구 거래 정지는 TRADE BAN 확인 뒤 trade 사유만 전송한다", async () => {
    render(<SanctionsSection userId="target-user" readOnly={false} />);

    fireEvent.change(screen.getByPlaceholderText("거래 제재 유저 노출 사유"), {
      target: { value: "거래 전용 영구 정지 사유" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "영구 거래 정지" }),
    );
    fireEvent.change(screen.getByPlaceholderText("TRADE BAN"), {
      target: { value: "TRADE BAN" },
    });
    fireEvent.click(screen.getByRole("button", { name: "실행" }));

    await waitFor(() => {
      expect(api.adminPost).toHaveBeenCalledWith(
        "/api/admin/sanctions",
        expect.objectContaining({
          userId: "target-user",
          scope: "trade",
          action: "ban",
          reason: "거래 전용 영구 정지 사유",
        }),
      );
    });
  });

  it("선택한 유저가 바뀌면 이전 유저의 거래 정리 결과를 숨긴다", async () => {
    api.adminPost.mockResolvedValue({
      ok: true,
      cleanup: {
        listingsCancelled: 1,
        buyOrdersCancelled: 2,
        highestBidsCleared: 3,
        refundedGold: 4_000,
      },
    });
    const { rerender } = render(
      <SanctionsSection userId="first-user" readOnly={false} />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "거래 제재 해제" }),
    );
    await screen.findByText(/거래 노출 정리 결과.*취소 매물 1건/);

    rerender(<SanctionsSection userId="next-user" readOnly={false} />);

    expect(screen.queryByText(/거래 노출 정리 결과/)).toBeNull();
  });

  it("늦게 끝난 이전 유저 조회가 새 선택의 상태를 덮어쓰지 않는다", async () => {
    let resolveFirstLoad: ((value: typeof activeStatus) => void) | undefined;
    const firstLoad = new Promise<typeof activeStatus>((resolve) => {
      resolveFirstLoad = resolve;
    });
    const nextUserStatus = {
      ...activeStatus,
      banReason: "새 선택 사용자 상태",
      trade: { ...activeStatus.trade, reason: "새 선택 거래 상태" },
    };
    api.adminGet
      .mockImplementationOnce(() => firstLoad)
      .mockResolvedValueOnce(nextUserStatus);

    const { rerender } = render(
      <SanctionsSection userId="first-user" readOnly={false} />,
    );
    await waitFor(() => expect(api.adminGet).toHaveBeenCalledTimes(1));

    rerender(<SanctionsSection userId="next-user" readOnly={false} />);
    await screen.findByText(/새 선택 사용자 상태/);
    resolveFirstLoad?.({ ...activeStatus, banReason: "이전 사용자 상태" });

    await waitFor(() => {
      expect(screen.queryByText(/이전 사용자 상태/)).toBeNull();
    });
  });

  it("늦게 끝난 이전 유저 액션이 새 선택의 조회를 무효화하지 않는다", async () => {
    let resolvePost: ((value: { ok: true }) => void) | undefined;
    const pendingPost = new Promise<{ ok: true }>((resolve) => {
      resolvePost = resolve;
    });
    let resolveNextUserLoad: ((value: typeof activeStatus) => void) | undefined;
    const nextUserLoad = new Promise<typeof activeStatus>((resolve) => {
      resolveNextUserLoad = resolve;
    });
    const nextUserStatus = {
      ...activeStatus,
      banReason: "새 선택 액션 이후 상태",
      trade: { ...activeStatus.trade, reason: "새 선택 거래 상태" },
    };
    api.adminGet
      .mockResolvedValueOnce(activeStatus)
      .mockImplementationOnce(() => nextUserLoad);
    api.adminPost.mockImplementationOnce(() => pendingPost);

    const { rerender } = render(
      <SanctionsSection userId="first-user" readOnly={false} />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "거래 제재 해제" }),
    );
    await waitFor(() => expect(api.adminPost).toHaveBeenCalledTimes(1));

    rerender(<SanctionsSection userId="next-user" readOnly={false} />);
    await waitFor(() => expect(api.adminGet).toHaveBeenCalledTimes(2));

    resolvePost?.({ ok: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(api.adminGet).toHaveBeenCalledTimes(2);

    resolveNextUserLoad?.(nextUserStatus);
    await screen.findByText(/새 선택 액션 이후 상태/);
    expect(screen.getByRole("button", { name: "거래 제재 해제" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("보기 전용 또는 제재 권한이 없으면 거래 제재 변경을 막는다", async () => {
    const { rerender } = render(
      <SanctionsSection userId="target-user" readOnly />,
    );

    expect(
      await screen.findByRole("button", { name: "거래 제재 해제" }),
    ).toHaveProperty("disabled", true);

    admin.value = {
      showToast: vi.fn(),
      adminMe: {
        capabilities: {
          read: true,
          reward: true,
          sanction: false,
          super: false,
        },
      },
    };
    rerender(<SanctionsSection userId="target-user" readOnly={false} />);

    expect(
      screen.getByRole("button", { name: "영구 거래 정지" }),
    ).toHaveProperty("disabled", true);
  });
});
