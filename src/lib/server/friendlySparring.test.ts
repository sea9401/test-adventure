import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeRows: [] as Record<string, unknown>[],
  saveRows: [] as Array<{ key: string; value: unknown }>,
  blocked: false,
  derived: {
    maxHp: 150,
    player: { hp: 23, mp: 4, maxMp: 40 },
  } as null | { maxHp: number; player: Record<string, unknown> },
  derivePlayerCombatV2: vi.fn(),
  sanitizeCombatLoadout: vi.fn((skills: unknown) => skills),
}));

vi.mock("@/db", () => ({
  db: {
    execute: vi.fn(async () => ({ rows: mocks.executeRows })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => mocks.saveRows),
      })),
    })),
  },
}));
vi.mock("@/lib/server/ugcSafety", () => ({
  usersCannotInteract: vi.fn(async () => mocks.blocked),
}));
vi.mock("@/lib/server/isAdmin", () => ({
  isSuperAdminEmail: (email: string | null | undefined) =>
    email === "operator@example.com",
}));
vi.mock("@/lib/server/derivePlayerCombatV2", () => ({
  derivePlayerCombatV2: mocks.derivePlayerCombatV2,
}));
vi.mock("@/lib/server/v2Skills", () => ({
  sanitizeCombatLoadout: mocks.sanitizeCombatLoadout,
}));
vi.mock("@/lib/server/codexSpBonus", () => ({
  readCodexSpBonus: vi.fn(async () => ({ total: 0 })),
}));
vi.mock("@/lib/server/jobUnlockContext", () => ({
  readJobUnlockContext: vi.fn(async () => ({})),
}));
vi.mock("@/adventure/data/v2/coreLoopConfig", () => ({
  V2_CORE_LOOP_V2: false,
}));
vi.mock("@/lib/server/serverFeed", () => ({
  resolveUserDisplayName: vi.fn(async () => "상대"),
}));

import {
  prepareFriendlySparringCombatant,
  resolveFriendlySparringTarget,
} from "./friendlySparring";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.blocked = false;
  mocks.executeRows = [
    {
      user_id: "target",
      email: "target@example.com",
      display_name: "상대",
      character: { level: 77, museunCosmetics: {} },
      profile: { name: "상대", gender: "female2" },
    },
  ];
  mocks.saveRows = [
    { key: "character.v2", value: { level: 77 } },
    { key: "equipment.v2", value: { equipped: { weapon: "w1" } } },
    {
      key: "skills.v2",
      value: {
        learned: ["v2_skill_strike"],
        equipped: ["v2_skill_strike"],
      },
    },
    { key: "proficiency.v2", value: { groups: {} } },
    { key: "character-profile.v2", value: { name: "상대" } },
  ];
  mocks.derived = {
    maxHp: 150,
    player: { hp: 23, mp: 4, maxMp: 40 },
  };
  mocks.derivePlayerCombatV2.mockImplementation(async () => mocks.derived);
});

describe("resolveFriendlySparringTarget", () => {
  it("정확한 표시 닉네임을 공개 가능한 상대 요약으로 해석한다", async () => {
    await expect(
      resolveFriendlySparringTarget("viewer", "  상대  "),
    ).resolves.toMatchObject({
      userId: "target",
      name: "상대",
      level: 77,
      avatar: "female2",
    });
  });

  it("본인·운영 계정·차단 관계는 모두 찾을 수 없는 대상으로 숨긴다", async () => {
    mocks.executeRows[0]!.user_id = "viewer";
    await expect(
      resolveFriendlySparringTarget("viewer", "나"),
    ).resolves.toBeNull();

    mocks.executeRows[0]!.user_id = "target";
    mocks.executeRows[0]!.email = "operator@example.com";
    await expect(
      resolveFriendlySparringTarget("viewer", "운영자"),
    ).resolves.toBeNull();

    mocks.executeRows[0]!.email = "target@example.com";
    mocks.blocked = true;
    await expect(
      resolveFriendlySparringTarget("viewer", "차단됨"),
    ).resolves.toBeNull();
  });

  it("손상된 캐릭터 저장값은 검색 결과로 노출하지 않는다", async () => {
    mocks.executeRows[0]!.character = "broken";
    await expect(
      resolveFriendlySparringTarget("viewer", "상대"),
    ).resolves.toBeNull();

    mocks.executeRows[0]!.character = [];
    await expect(
      resolveFriendlySparringTarget("viewer", "상대"),
    ).resolves.toBeNull();
  });
});

describe("prepareFriendlySparringCombatant", () => {
  it("현재 세팅을 음식 없이 파생하고 HP와 MP를 최대로 채운다", async () => {
    await expect(
      prepareFriendlySparringCombatant("target"),
    ).resolves.toMatchObject({
      name: "상대",
      level: 77,
      player: { hp: 150, mp: 40, maxMp: 40 },
      skills: { equipped: ["v2_skill_strike"] },
    });
    expect(mocks.derivePlayerCombatV2).toHaveBeenCalledWith(
      "target",
      expect.anything(),
      expect.objectContaining({
        character: { level: 77 },
        equipmentSave: { equipped: { weapon: "w1" } },
        skillsRaw: expect.objectContaining({
          equipped: ["v2_skill_strike"],
        }),
        includeCookingBuff: false,
      }),
    );
  });

  it("캐릭터나 전투 파생 결과가 없으면 null을 반환한다", async () => {
    mocks.saveRows = mocks.saveRows.filter((row) => row.key !== "character.v2");
    await expect(
      prepareFriendlySparringCombatant("target"),
    ).resolves.toBeNull();

    mocks.saveRows.push({ key: "character.v2", value: { level: 77 } });
    mocks.derived = null;
    await expect(
      prepareFriendlySparringCombatant("target"),
    ).resolves.toBeNull();
  });
});
