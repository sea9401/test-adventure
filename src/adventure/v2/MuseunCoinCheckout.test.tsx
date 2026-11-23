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
        sdk.paymentRequestHandler = handler as unknown as (
          params: { paymentMethod: { code: string } },
        ) => Promise<void>;
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
    expect(await screen.findAllByRole("button", { name: "결제 준비 중" })).toHaveLength(5);
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
  it("charges a typed amount in 1,000 won units", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "POST"
        ? Response.json({ ok: true, orderId: "mc_custom", orderName: "무슨 코인 700개", amountKrw: 7_000, coinAmount: 700, customerKey: "mc_customer", clientKey: "test_ck" }, { status: 201 })
        : Response.json({ ok: true, orders: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<MuseunCoinCheckout />);

    const input = await screen.findByLabelText("금액 직접 입력");
    await screen.findByRole("button", { name: "10,000원 결제" });
    expect((screen.getByRole("button", { name: "금액 입력" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: "7,000원" } });
    expect((input as HTMLInputElement).value).toBe("7000");
    expect(screen.getByText("700코인을 받습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "7,000원 결제" }));

    await waitFor(() => expect(sdk.renderPaymentWindow).toHaveBeenCalledTimes(1));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ customAmountKrw: 7_000 });
    expect(sdk.setAmount).toHaveBeenCalledWith({ value: 7_000, currency: "KRW" });
  });

  it("blocks a typed amount outside the unit or range", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true, orders: [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MuseunCoinCheckout />);

    const input = await screen.findByLabelText("금액 직접 입력");
    await screen.findByRole("button", { name: "10,000원 결제" });
    for (const value of ["1500", "500", "51000"]) {
      fireEvent.change(input, { target: { value } });
      expect((screen.getByRole("button", { name: "금액 입력" }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText("1,000원 단위로 1,000원부터 50,000원까지 입력해 주세요.")).toBeTruthy();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
