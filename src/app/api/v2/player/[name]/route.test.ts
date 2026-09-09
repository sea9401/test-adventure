import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectCall: 0,
  equipment: {} as Record<string, unknown>,
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
      critResistPct: 101.5,
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
              { key: "equipment.v2", value: mocks.equipment },
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
    mocks.equipment = {};
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

  it("상한 없는 치명타 저항을 공개 캐릭터 정보에 전달한다", async () => {
    const response = await GET(
      new Request("http://test/api/v2/player/%ED%83%9C%EC%B4%88%EC%88%A0%EC%82%AC"),
      { params: Promise.resolve({ name: "태초술사" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.combat).toMatchObject({ critResistPct: 101.5 });
  });
});


it("공개 장착 장비에 해방 옵션을 포함하고 미장착 장비와 개인 플래그는 숨긴다", async () => {
  const liberation = {rank: 2, lineCount: 2, revision: 7, options: [{id: "base_str_pct", level: 10}, {id: "skill_crit_damage_pp", level: 8}]};
  mocks.selectCall = 0;
  mocks.equipment = {equipped: {gloves: "shown"}, owned: [
    {iid: "shown", id: "v2_boss_catastrophe_gloves", liberation, locked: true},
    {iid: "hidden", id: "v2_boss_catastrophe_gloves", liberation},
  ]};
  const response = await GET(new Request("http://test/api/v2/player/test"), {params: Promise.resolve({name: "test"})});
  const json = await response.json();
  expect(json.equipment.owned).toHaveLength(1);
  expect(json.equipment.owned[0].liberation).toEqual(liberation);
  expect(json.equipment.owned[0]).not.toHaveProperty("locked");
});
