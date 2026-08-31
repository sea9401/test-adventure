import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
}));

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_executor, _userId, key: string, fallback: unknown) =>
      mocks.store.has(key) ? mocks.store.get(key) : fallback,
  ),
  upsertSave: vi.fn(
    async (_executor, _userId, key: string, value: unknown) => {
      mocks.store.set(key, value);
    },
  ),
}));

import { ensureV2Character } from "./v2Character";

function executor() {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () =>
      mocks.store.has("character.v2") ? [{ key: "character.v2" }] : [],
  };
  return {
    select: () => chain,
    insert: () => ({
      values: (value: { key: string; value: unknown }) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (mocks.store.has(value.key)) return [];
            mocks.store.set(value.key, value.value);
            return [{ key: value.key }];
          },
        }),
      }),
    }),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store.clear();
});

describe("ensureV2Character", () => {
  it("완전히 새로운 캐릭터에는 Lv.1 생애 자원 굴림을 함께 저장한다", async () => {
    await ensureV2Character(executor(), "new-user", () => 0);

    expect(mocks.store.get("character.v2")).toEqual({});
    expect(mocks.store.get("proficiency.v2")).toMatchObject({
      lifeResourceGrowth: {
        version: 2,
        rolledLevel: 1,
        baseHp: 150,
        baseMp: 65,
        gainedHp: 0,
        gainedMp: 0,
      },
    });
  });

  it("이미 존재하는 캐릭터에는 생애 기록을 소급 생성하지 않는다", async () => {
    mocks.store.set("character.v2", { class: "warrior", level: 37 });
    mocks.store.set("proficiency.v2", { points: 10 });

    await ensureV2Character(executor(), "legacy-user", () => 0);

    expect(mocks.store.get("character.v2")).toEqual({
      class: "warrior",
      level: 37,
    });
    expect(mocks.store.get("proficiency.v2")).toEqual({ points: 10 });
  });

  it("동시 최초 진입에서도 생애 자원을 한 번만 굴린다", async () => {
    let rngCalls = 0;
    const rng = () => {
      rngCalls += 1;
      return 0;
    };
    const sharedExecutor = executor();

    await Promise.all([
      ensureV2Character(sharedExecutor, "new-user", rng),
      ensureV2Character(sharedExecutor, "new-user", rng),
    ]);

    expect(rngCalls).toBe(2);
    expect(mocks.store.get("proficiency.v2")).toHaveProperty(
      "lifeResourceGrowth",
    );
  });
});
