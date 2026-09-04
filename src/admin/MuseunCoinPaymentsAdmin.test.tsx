// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MuseunCoinPaymentsAdmin } from "./MuseunCoinPaymentsAdmin";

const response = {
  ok: true,
  orders: [{ orderId: "mc_order1", userId: "u1", packageId: "coin_1000", coinAmount: 1000, amountKrw: 10000, status: "paid", method: "카드", requestedAt: "2026-09-04T00:00:00.000Z", approvedAt: "2026-09-04T00:01:00.000Z" }],
  refunds: [{ id: "mcr_1", orderId: "mc_order1", userId: "u1", requestedCoins: 600, amountKrw: 6000, reason: "부분 사용", status: "review_required", processedByEmail: null, createdAt: "2026-09-04T01:00:00.000Z" }],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
    init?.method === "POST" ? Response.json({ ok: true, refund: { status: "completed" } }) : Response.json(response),
  ));
});
afterEach(() => cleanup());

describe("payment operations console", () => {
  it("searches and renders safe order and refund summaries", async () => {
    render(<MuseunCoinPaymentsAdmin />);
    expect(await screen.findByText("mc_order1")).toBeDefined();
    expect(screen.getByText("mcr_1")).toBeDefined();
    fireEvent.change(screen.getByLabelText("주문·사용자 검색"), { target: { value: "u1" } });
    fireEvent.click(screen.getByRole("button", { name: "조회" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("query=u1"), expect.anything()));
  });

  it("requires a reason before approving a reviewed refund", async () => {
    render(<MuseunCoinPaymentsAdmin />);
    fireEvent.click(await screen.findByRole("button", { name: "환불 승인" }));
    const submit = screen.getByRole("button", { name: "승인 확정" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("처리 사유"), { target: { value: "고객 요청 확인" } });
    fireEvent.click(submit);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/admin/museun-coin-payments", expect.objectContaining({ method: "POST" })));
  });
});
