// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";

const auth = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock("next-auth/react", () => auth);

import { PlayerSanctionGate } from "./PlayerSanctionGate";

const fetchMock = vi.fn();

function response(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("PlayerSanctionGate 거래 이용 제한 안내", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("최초 상태 확인 실패 후 2초 뒤 자동 재시도해 게임 본문을 복구한다", async () => {
    vi.useFakeTimers();
    const failed = deferred<Response>();
    fetchMock
      .mockImplementationOnce(() => failed.promise)
      .mockResolvedValueOnce(
        response({
          ok: true,
          suspension: null,
          tradeSuspension: null,
          warning: null,
        }),
      );

    render(
      <PlayerSanctionGate>
        <div>게임 본문</div>
      </PlayerSanctionGate>,
    );

    await act(async () => {
      failed.resolve(response({}, 503));
      await failed.promise;
    });
    expect(screen.getByText("계정 상태를 확인하지 못했습니다")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_999);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("게임 본문")).toBeDefined();
  });

  it("오류 화면이 언마운트되면 예약된 자동 재시도를 취소한다", async () => {
    vi.useFakeTimers();
    const failed = deferred<Response>();
    fetchMock.mockImplementationOnce(() => failed.promise);

    const { unmount } = render(
      <PlayerSanctionGate>
        <div>게임 본문</div>
      </PlayerSanctionGate>,
    );

    await act(async () => {
      failed.resolve(response({}, 503));
      await failed.promise;
    });
    expect(screen.getByText("계정 상태를 확인하지 못했습니다")).toBeDefined();

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("반복 실패하면 재시도 간격을 5초와 최대 10초까지 늘린다", async () => {
    vi.useFakeTimers();
    const failed = deferred<Response>();
    fetchMock
      .mockImplementationOnce(() => failed.promise)
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(
        response({
          ok: true,
          suspension: null,
          tradeSuspension: null,
          warning: null,
        }),
      );

    render(
      <PlayerSanctionGate>
        <div>게임 본문</div>
      </PlayerSanctionGate>,
    );
    await act(async () => {
      failed.resolve(response({}, 503));
      await failed.promise;
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_999);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_999);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(screen.getByText("게임 본문")).toBeDefined();
  });

  it("게임 본문 위에 미확인 거래 제한을 한 번 안내하고 해당 제재만 확인 처리한다", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({
          ok: true,
          suspension: null,
          tradeSuspension: {
            id: 11,
            reason: "비정상 거래 조사",
            expiresAt: "2026-08-23T00:00:00.000Z",
            permanent: false,
            acknowledged: false,
          },
          warning: null,
        }),
      )
      .mockResolvedValueOnce(response({ ok: true, sanctionId: 11, kind: "trade" }))
      .mockResolvedValueOnce(
        response({
          ok: true,
          suspension: null,
          tradeSuspension: {
            id: 11,
            reason: "비정상 거래 조사",
            expiresAt: "2026-08-23T00:00:00.000Z",
            permanent: false,
            acknowledged: true,
          },
          warning: null,
        }),
      );

    render(
      <PlayerSanctionGate>
        <div>게임 본문</div>
      </PlayerSanctionGate>,
    );

    expect(await screen.findByText("게임 본문")).toBeDefined();
    const dialog = screen.getByRole("dialog", { name: "거래 이용 제한" });
    expect(dialog).toBeDefined();
    expect(screen.getByText("비정상 거래 조사")).toBeDefined();
    expect(dialog.textContent).toContain("2026년");
    expect(document.body.innerHTML).toContain(SURFACE_CARD.split(" ")[0]);
    expect(document.body.innerHTML).toContain(SURFACE_INSET.split(" ")[0]);

    fireEvent.click(screen.getByRole("button", { name: "내용을 확인했습니다" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v2/me/sanctions",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ sanctionId: 11, kind: "trade" }),
        }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "거래 이용 제한" })).toBeNull();
    });
    expect(screen.getByText("게임 본문")).toBeDefined();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("계정 이용 정지가 함께 있으면 게임 본문과 거래 안내보다 전체 정지 화면을 우선한다", async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        ok: true,
        suspension: {
          reason: "계정 보호 조치",
          expiresAt: "2026-08-24T00:00:00.000Z",
          permanent: false,
        },
        tradeSuspension: {
          id: 12,
          reason: "거래 조사",
          expiresAt: "2026-08-23T00:00:00.000Z",
          permanent: false,
          acknowledged: false,
        },
        warning: null,
      }),
    );

    render(
      <PlayerSanctionGate>
        <div>게임 본문</div>
      </PlayerSanctionGate>,
    );

    expect(await screen.findByText("게임 이용이 제한되었습니다")).toBeDefined();
    expect(screen.queryByText("게임 본문")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "거래 이용 제한" })).toBeNull();
  });

  it("확인 뒤 늦게 끝난 이전 상태 조회가 같은 거래 제한 안내를 다시 열지 않는다", async () => {
    const tradeSuspension = {
      id: 13,
      reason: "순서 역전 조사",
      expiresAt: "2026-08-25T00:00:00.000Z",
      permanent: false,
      acknowledged: false,
    };
    const staleGet = deferred<Response>();
    fetchMock
      .mockResolvedValueOnce(
        response({
          ok: true,
          suspension: null,
          tradeSuspension,
          warning: null,
        }),
      )
      .mockImplementationOnce(() => staleGet.promise)
      .mockResolvedValueOnce(response({ ok: true, sanctionId: 13, kind: "trade" }))
      .mockResolvedValueOnce(
        response({
          ok: true,
          suspension: null,
          tradeSuspension: { ...tradeSuspension, acknowledged: true },
          warning: null,
        }),
      );

    render(
      <PlayerSanctionGate>
        <div>게임 본문</div>
      </PlayerSanctionGate>,
    );

    expect(
      await screen.findByRole("dialog", { name: "거래 이용 제한" }),
    ).toBeDefined();

    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "내용을 확인했습니다" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "거래 이용 제한" })).toBeNull();
    });

    await act(async () => {
      staleGet.resolve(
        response({
          ok: true,
          suspension: null,
          tradeSuspension,
          warning: null,
        }),
      );
      await staleGet.promise;
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "거래 이용 제한" })).toBeNull();
    });
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});
