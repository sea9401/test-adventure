import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  character: null as Record<string, unknown> | null,
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-secret-shop"),
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(
    async (_db: object, _userId: string, _key: string, fallback: unknown) =>
      mocks.character ?? fallback,
  ),
  lockSaveForUpdate: vi.fn(),
  upsertSave: vi.fn(),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));

import { GET } from "./route";
import {
  newRareMapInstance,
  RARE_MAP_TTL_MS,
} from "@/adventure/data/v2/rareMaps";

const NOW = 2_000_000;
const FOUND_AT = NOW - 5 * 60_000;

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  mocks.character = {
    gold: 123_456,
    rareMaps: [
      newRareMapInstance("secret_shop_map", 70, FOUND_AT, "rm-shop"),
    ],
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/v2/secret-shop", () => {
  it("서버 기준 지도 만료 시각을 상점 응답에 포함한다", async () => {
    const response = await GET(
      new Request("http://localhost/api/v2/secret-shop?map=rm-shop"),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      map: "rm-shop",
      serverNow: NOW,
      expiresAt: FOUND_AT + RARE_MAP_TTL_MS,
    });
  });
});
