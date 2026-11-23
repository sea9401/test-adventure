import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, inserted } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  inserted: [] as Array<{ type: string; payload: unknown }>,
}));

vi.mock("@/db", () => {
  const lockChain = {
    from: () => lockChain,
    where: () => lockChain,
    for: () => lockChain,
    limit: async () => [],
  };
  return {
    db: {
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
        cb({ select: () => lockChain }),
      ),
    },
  };
});

vi.mock("@/db/schema", () => ({ users: { id: {} } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

vi.mock("@/lib/server/v2Notifications", () => ({
  insertNotificationWith: vi.fn(async (_tx, _uid, type: string, payload: unknown) => {
    inserted.push({ type, payload });
  }),
}));

import { SUPPORT_PASS_NOTICE_SAVE_KEY } from "@/adventure/v2/supportPassNotice";
import { recordDueSupportPassNotices } from "./supportPassNotice";

const DAY = 24 * 60 * 60 * 1_000;
const NOW = Date.UTC(2026, 10, 23, 3);

beforeEach(() => {
  store.clear();
  inserted.length = 0;
});

describe("지원권 만료 알림 기록", () => {
  it("끝나기 3일 전이면 알림을 한 번 남기고 보낸 종료 시각을 기록한다", async () => {
    const support = { activatedAt: NOW - 28 * DAY, activeUntil: NOW + 2 * DAY };

    expect(await recordDueSupportPassNotices("u", support, {}, NOW)).toBe(1);
    expect(inserted).toEqual([
      {
        type: "support_pass_expiring",
        payload: { tier: "standard", endAt: support.activeUntil, continuesStandard: false },
      },
    ]);
    expect(store.get(SUPPORT_PASS_NOTICE_SAVE_KEY)).toEqual({
      expiringFor: support.activeUntil,
      expiredFor: null,
    });

    expect(
      await recordDueSupportPassNotices("u", support, store.get(SUPPORT_PASS_NOTICE_SAVE_KEY), NOW),
    ).toBe(0);
    expect(inserted).toHaveLength(1);
  });

  it("겹친 요청이 낡은 기록을 들고 와도 저장된 기록을 다시 읽어 두 번 남기지 않는다", async () => {
    const support = { activatedAt: NOW - 40 * DAY, activeUntil: NOW - DAY };
    store.set(SUPPORT_PASS_NOTICE_SAVE_KEY, { expiringFor: null, expiredFor: support.activeUntil });

    expect(await recordDueSupportPassNotices("u", support, {}, NOW)).toBe(0);
    expect(inserted).toEqual([]);
  });

  it("넉넉히 남았으면 아무것도 하지 않는다", async () => {
    const support = { activatedAt: NOW - DAY, activeUntil: NOW + 20 * DAY };

    expect(await recordDueSupportPassNotices("u", support, {}, NOW)).toBe(0);
    expect(store.has(SUPPORT_PASS_NOTICE_SAVE_KEY)).toBe(false);
  });
});
