import { afterEach, describe, expect, it, vi } from "vitest";

type InboxDeleteApi = {
  deleteCompletedInbox: () => Promise<{ ok: true; deletedIds: number[] }>;
  deleteReceivedInbox: (
    id: number,
  ) => Promise<{ ok: true; deletedAt: string }>;
  inboxDeleteErrorLabel: (
    payload: { error?: string } | null,
    status: number,
  ) => string;
};

async function deleteApi(): Promise<InboxDeleteApi> {
  const loadedApi = await import("./api");
  const api = loadedApi as unknown as Partial<InboxDeleteApi>;
  expect(api.deleteReceivedInbox).toBeTypeOf("function");
  expect(api.inboxDeleteErrorLabel).toBeTypeOf("function");
  return api as InboxDeleteApi;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("완료 우편 일괄 삭제 API", () => {
  it("서버가 전체 대상 우편을 판단하도록 ID 목록 없이 POST한다", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ ok: true, deletedIds: [7, 8] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = await deleteApi();

    await expect(api.deleteCompletedInbox()).resolves.toEqual({
      ok: true,
      deletedIds: [7, 8],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marketplace/inbox/delete-completed",
      { method: "POST" },
    );
  });

  it("실패 응답이면 삭제 성공으로 처리하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("error", { status: 500 })));
    const api = await deleteApi();
    await expect(api.deleteCompletedInbox()).rejects.toThrow("우편 삭제 실패 (500)");
  });

  it.each([
    { ok: true },
    { ok: false, deletedIds: [7] },
    { ok: true, deletedIds: ["7"] },
    { ok: true, deletedIds: [0] },
    { ok: true, deletedIds: [1.5] },
  ])("잘못된 삭제 응답을 거부한다: %j", async (payload) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(payload)));
    const api = await deleteApi();
    await expect(api.deleteCompletedInbox()).rejects.toThrow("우편 삭제 실패");
  });
});

describe("받은 우편 삭제 API", () => {
  it("우편 ID를 JSON POST로 보내고 삭제 시각을 반환한다", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        ok: true,
        deletedAt: "2026-09-04T09:30:00.000Z",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { deleteReceivedInbox } = await deleteApi();

    await expect(deleteReceivedInbox(7)).resolves.toEqual({
      ok: true,
      deletedAt: "2026-09-04T09:30:00.000Z",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marketplace/inbox/delete",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: 7 }),
      },
    );
  });

  it("완료 전 우편 삭제 거부를 이해할 수 있는 문구로 바꾼다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "not_completed" }, { status: 409 }),
      ),
    );
    const { deleteReceivedInbox } = await deleteApi();

    await expect(deleteReceivedInbox(1)).rejects.toThrow(
      "수령하거나 처리를 마친 우편만 삭제할 수 있어요.",
    );
  });

  it("JSON이 아닌 실패 응답에는 상태 코드를 표시한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("server error", { status: 500 })),
    );
    const { deleteReceivedInbox } = await deleteApi();

    await expect(deleteReceivedInbox(1)).rejects.toThrow(
      "우편 삭제 실패 (500)",
    );
  });
});
