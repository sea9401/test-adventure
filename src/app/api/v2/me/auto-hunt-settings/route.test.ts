import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "potion-user" as string | null,
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

import {
  AUTO_HUNT_STOP_SAVE_KEY,
  DEFAULT_AUTO_HUNT_STOP_CONFIG,
} from "@/adventure/v2/autoHuntStopPolicy";
import { upsertSave } from "@/lib/server/savesKv";
import { GET, PATCH } from "./route";

function patchRequest(config: unknown) {
  return new Request("http://localhost/api/v2/me/auto-hunt-settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ config }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId = "potion-user";
  mocks.saved = null;
});

describe("자동사냥 물약 설정 API", () => {
  it("저장값이 없으면 로컬 설정 이전을 위해 null을 반환한다", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, config: null });
  });

  it("설정을 정규화해 계정 저장소에 보관한다", async () => {
    const response = await PATCH(
      patchRequest({
        hpPotionTargetPct: 55.9,
        mpPotionTargetPct: 35,
        potionEnabled: true,
        potionThreshold: -10,
        rareMapEnabled: true,
        level100Enabled: false,
      }),
    );

    expect(response.status).toBe(200);
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "potion-user",
      AUTO_HUNT_STOP_SAVE_KEY,
      {
        ...DEFAULT_AUTO_HUNT_STOP_CONFIG,
        hpPotionTargetPct: 55,
        mpPotionTargetPct: 35,
        potionEnabled: true,
        potionThreshold: 0,
        rareMapEnabled: true,
      },
    );
  });

  it("인증되지 않은 조회와 변경을 거부한다", async () => {
    mocks.userId = null;

    expect((await GET()).status).toBe(401);
    expect((await PATCH(patchRequest({}))).status).toBe(401);
    expect(upsertSave).not.toHaveBeenCalled();
  });
});
