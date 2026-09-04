// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  setAmount: vi.fn(async () => undefined),
  requestPayment: vi.fn(async () => undefined),
  widgets: vi.fn(),
  load: vi.fn(),
}));
vi.mock("@tosspayments/tosspayments-sdk", () => ({ loadTossPayments: sdk.load }));
import { MuseunCoinCheckout } from "./MuseunCoinCheckout";

beforeEach(() => {
  vi.clearAllMocks();
  sdk.widgets.mockReturnValue({ setAmount: sdk.setAmount, requestPayment: sdk.requestPayment });
  sdk.load.mockResolvedValue({ widgets: sdk.widgets });
});
afterEach(() => cleanup());

describe("Museun Coin checkout", () => {
  it("keeps payment disabled when the server mode is closed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    render(<MuseunCoinCheckout />);
    expect(await screen.findAllByRole("button", { name: "결제 준비 중" })).toHaveLength(4);
  });

  it("creates one server order before requesting Toss payment", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "POST"
        ? Response.json({ ok: true, orderId: "mc_order", orderName: "무슨 코인 1,000개", amountKrw: 10_000, coinAmount: 1_000, customerKey: "mc_customer", clientKey: "test_ck" }, { status: 201 })
        : Response.json({ ok: true, orders: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<MuseunCoinCheckout />);
    const button = await screen.findByRole("button", { name: "10,000원 결제" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(sdk.requestPayment).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/v2/museun-coin-payments/orders", expect.objectContaining({ method: "POST" }));
    expect(sdk.setAmount).toHaveBeenCalledWith({ value: 10_000, currency: "KRW" });
    expect(sdk.requestPayment).toHaveBeenCalledWith(expect.objectContaining({ orderId: "mc_order", orderName: "무슨 코인 1,000개" }));
  });
});
