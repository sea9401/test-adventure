import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectCall: 0,
  execute: vi.fn(async () => ({
    rows: [
      {
        user_id: "target-user",
        email: "target@example.com",
        display_name: "태초술사",
      },
    ],
  })),
  deriveCombat: vi.fn(async () => ({
    maxHp: 1_000,
    baseAllocatedStats: {
      str: 10,
      vit: 10,
      dex: 10,
      int: 100,
      spi: 100,
      luk: 10,
    },
    totalStats: {
      str: 10,
      vit: 10,
      dex: 10,
      int: 120,
      spi: 120,
      luk: 10,
    },
    player: {
      atk: 100,
      def: 80,
      spd: 70,
      maxMp: 500,
      magicAtk: 300,
      magicDef: 200,
      evasionPct: 5,
      evaRating: 5,
      accuracyPct: 10,
      accRating: 10,
      critChancePct: 75,
      critMult: 1.8,
      equipmentMagicSkillCritDmgPct: 29.5102,
    },
  })),
}));

vi.mock("@/db", () => ({
  db: {
    execute: mocks.execute,
    select: vi.fn(() => {
      mocks.selectCall += 1;
      if (mocks.selectCall === 1) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(async () => [
              {
                key: "character.v2",
                value: { level: 100, class: "mage" },
              },
            ]),
          })),
        };
      }
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(async () => []) })),
        })),
      };
    }),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "viewer-user"),
}));
vi.mock("@/lib/server/derivePlayerCombatV2", () => ({
  derivePlayerCombatV2: mocks.deriveCombat,
}));
vi.mock("@/lib/server/ugcSafety", () => ({
  readBlockedUserIds: vi.fn(async () => []),
}));

import { GET } from "./route";

describe("GET /api/v2/player/[name]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectCall = 0;
  });

  it("원초 증폭의 장비 치명타 변환값을 공개 캐릭터 정보에 전달한다", async () => {
    const response = await GET(
      new Request("http://test/api/v2/player/%ED%83%9C%EC%B4%88%EC%88%A0%EC%82%AC"),
      { params: Promise.resolve({ name: "태초술사" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.combat).toMatchObject({
      equipmentMagicSkillCritDmgPct: 29.5102,
    });
  });
});
