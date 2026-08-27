import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "visibility-user" as string | null,
  saved: null as unknown,
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(async () => mocks.saved),
  upsertSave: vi.fn(async (_db, _userId, _key, value) => {
    mocks.saved = value;
  }),
}));

import { DUNGEON_THEME_VISIBILITY_SAVE_KEY } from "@/adventure/v2/dungeonThemeVisibility";
import { upsertSave } from "@/lib/server/savesKv";
import { GET, PATCH } from "./route";

function patchRequest(hiddenThemeStarts: unknown) {
  return new Request(
    "http://localhost/api/v2/me/dungeon-visibility-settings",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hiddenThemeStarts }),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId = "visibility-user";
  mocks.saved = null;
});

describe("사냥터 표시 설정 API", () => {
  it("저장값이 없으면 기기 설정 이전을 위해 null을 반환한다", async () => {
    await expect((await GET()).json()).resolves.toEqual({
      ok: true,
      hiddenThemeStarts: null,
    });
  });

  it("설정을 정규화해 계정 저장소에 보관한다", async () => {
    const response = await PATCH(patchRequest([13.8, "7", 1, 7, -1]));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      hiddenThemeStarts: [1, 7, 13],
    });
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "visibility-user",
      DUNGEON_THEME_VISIBILITY_SAVE_KEY,
      [1, 7, 13],
    );
  });

  it("인증되지 않은 조회와 변경을 거부한다", async () => {
    mocks.userId = null;

    expect((await GET()).status).toBe(401);
    expect((await PATCH(patchRequest([]))).status).toBe(401);
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("배열이 아닌 변경 요청을 거부한다", async () => {
    expect((await PATCH(patchRequest("1,7"))).status).toBe(400);
    expect(upsertSave).not.toHaveBeenCalled();
  });
});
