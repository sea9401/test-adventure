// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    const { container } = render(<SanctionsSection userId="target-user" readOnly={false} />);

    await screen.findByText("거래 제재");

    expect(screen.getByText(/영구 밴 중.*계정 조사 중/)).toBeDefined();
    expect(screen.getByText(/거래 정지 중.*거래 조작 조사 중/)).toBeDefined();
    expect(screen.getByRole("button", { name: "1일 거래 정지" })).toBeDefined();
    expect(screen.getByRole("button", { name: "3일 거래 정지" })).toBeDefined();
    expect(screen.getByRole("button", { name: "7일 거래 정지" })).toBeDefined();
    expect(screen.getByRole("button", { name: "영구 거래 정지" })).toBeDefined();
    expect(container.innerHTML).toContain(SURFACE_CARD.split(" ")[0]);
    expect(container.innerHTML).toContain(SURFACE_INSET.split(" ")[0]);
    expect(container.innerHTML).toContain("bg-white");
    expect(container.innerHTML).toContain("dark:bg-zinc-900");
  });

  it("거래 제재 해제는 계정 제재와 무관하게 trade 범위로 전송한다", async () => {
    render(<SanctionsSection userId="target-user" readOnly={false} />);

    fireEvent.click(await screen.findByRole("button", { name: "거래 제재 해제" }));

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

  it("보기 전용 또는 제재 권한이 없으면 거래 제재 변경을 막는다", async () => {
    const { rerender } = render(<SanctionsSection userId="target-user" readOnly />);

    expect(
      await screen.findByRole("button", { name: "거래 제재 해제" }),
    ).toHaveProperty("disabled", true);

    admin.value = {
      showToast: vi.fn(),
      adminMe: {
        capabilities: { read: true, reward: true, sanction: false, super: false },
      },
    };
    rerender(<SanctionsSection userId="target-user" readOnly={false} />);

    expect(screen.getByRole("button", { name: "영구 거래 정지" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});
