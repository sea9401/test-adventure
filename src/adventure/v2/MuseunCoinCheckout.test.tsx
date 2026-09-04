// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  setAmount: vi.fn(async () => undefined),
  renderPaymentWindow: vi.fn(),
  requestPayment: vi.fn(async () => undefined),
  paymentWindowOn: vi.fn(),
  paymentWindowDestroy: vi.fn(async () => undefined),
  paymentRequestHandler: undefined as
    | ((params: { paymentMethod: { code: string } }) => Promise<void>)
    | undefined,
  cancelHandler: undefined as (() => Promise<void>) | undefined,
  widgets: vi.fn(),
  load: vi.fn(),
}));
vi.mock("@tosspayments/tosspayments-sdk", () => ({ loadTossPayments: sdk.load }));
import { MuseunCoinCheckout } from "./MuseunCoinCheckout";

beforeEach(() => {
  vi.clearAllMocks();
  sdk.paymentRequestHandler = undefined;
  sdk.cancelHandler = undefined;
  sdk.paymentWindowOn.mockImplementation(
    (eventName: string, handler: (...args: never[]) => Promise<void>) => {
      if (eventName === "paymentRequest") {
        sdk.paymentRequestHandler = handler as typeof sdk.paymentRequestHandler;
      }
      if (eventName === "cancel") {
        sdk.cancelHandler = handler;
      }
    },
  );
  sdk.renderPaymentWindow.mockResolvedValue({
    on: sdk.paymentWindowOn,
    destroy: sdk.paymentWindowDestroy,
  });
  sdk.widgets.mockReturnValue({
    setAmount: sdk.setAmount,
    renderPaymentWindow: sdk.renderPaymentWindow,
    requestPayment: sdk.requestPayment,
  });
  sdk.load.mockResolvedValue({ widgets: sdk.widgets });
});
afterEach(() => cleanup());

describe("Museun Coin checkout", () => {
  it("keeps payment disabled when the server mode is closed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    render(<MuseunCoinCheckout />);
    expect(await screen.findAllByRole("button", { name: "결제 준비 중" })).toHaveLength(4);
  });

  it("creates one order, renders the payment window, and requests payment only after selection", async () => {
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
    await waitFor(() => expect(sdk.renderPaymentWindow).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/v2/museun-coin-payments/orders", expect.objectContaining({ method: "POST" }));
    expect(sdk.setAmount).toHaveBeenCalledWith({ value: 10_000, currency: "KRW" });
    expect(sdk.requestPayment).not.toHaveBeenCalled();

    await act(async () => {
      await sdk.paymentRequestHandler?.({ paymentMethod: { code: "CARD" } });
    });

    expect(sdk.paymentWindowOn).toHaveBeenCalledWith(
      "paymentRequest",
      expect.any(Function),
    );
    expect(sdk.paymentWindowOn).toHaveBeenCalledWith(
      "cancel",
      expect.any(Function),
    );
    expect(sdk.requestPayment).toHaveBeenCalledWith(expect.objectContaining({ orderId: "mc_order", orderName: "무슨 코인 1,000개" }));
  });

  it("unlocks checkout when the user closes the payment window", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "POST"
        ? Response.json({ ok: true, orderId: "mc_order", orderName: "무슨 코인 1,000개", amountKrw: 10_000, coinAmount: 1_000, customerKey: "mc_customer", clientKey: "test_ck" }, { status: 201 })
        : Response.json({ ok: true, orders: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<MuseunCoinCheckout />);

    fireEvent.click(await screen.findByRole("button", { name: "10,000원 결제" }));
    await waitFor(() => expect(sdk.cancelHandler).toBeTypeOf("function"));
    await act(async () => {
      await sdk.cancelHandler?.();
    });

    const unlocked = await screen.findByRole("button", { name: "10,000원 결제" });
    expect((unlocked as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(unlocked);
    await waitFor(() => expect(sdk.renderPaymentWindow).toHaveBeenCalledTimes(2));
  });
});
