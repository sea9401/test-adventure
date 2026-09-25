// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GuildWeeklySuppliesPanel } from "./GuildWeeklySuppliesPanel";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("길드 주간 지원품 화면", () => {
  it("조회 실패 시 로딩을 끝내고 다시 열어 볼 수 있는 오류를 표시한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<GuildWeeklySuppliesPanel onChanged={vi.fn()} />);
    expect(await screen.findByText("길드 지원품 정보를 불러오지 못했습니다.")).toBeTruthy();
    expect(screen.queryByText("지원품 정보를 불러오는 중…")).toBeNull();
  });

  it("관리자에게 비용과 수령품을 알리고 결제 후 완료 상태를 보여 준다", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, weekKey: "2026-09-21", funded: false, cost: 30_000_000, potionsPerMember: 3, guildGold: 50_000_000, canFund: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, funded: true, guildGold: 20_000_000, recipientCount: 2 }) });
    vi.stubGlobal("fetch", fetcher);
    const onChanged = vi.fn();
    render(<GuildWeeklySuppliesPanel onChanged={onChanged} confirm={async () => true} />);

    expect(await screen.findByText(/귀속 스태미나 회복약 3개/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /30,000,000 G/ }));
    await waitFor(() => expect(screen.getByText(/이번 주 지원품을 마련했습니다/)).toBeTruthy());
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "이번 주 지급 완료" }).hasAttribute("disabled")).toBe(true);
  });
});
