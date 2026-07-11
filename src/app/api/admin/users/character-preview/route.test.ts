import { beforeEach, describe, expect, it, vi } from "vitest";

const { audit, saveRows, resolveBattleMock } = vi.hoisted(() => ({
  audit: vi.fn(async () => {}),
  saveRows: [
    {
      key: "character.v2",
      value: {
        level: 30,
        class: "warrior",
        hp: 1,
        mp: 0,
        frontierDepth: 12,
        element: "fire",
      },
    },
    {
      key: "character-profile.v2",
      value: { name: "체험자", gender: "female1" },
    },
    { key: "equipment.v2", value: {} },
    { key: "proficiency.v2", value: {} },
    { key: "skills.v2", value: { learned: [], equipped: [] } },
  ],
  resolveBattleMock: vi.fn(() => ({
    outcome: "win",
    turns: 3,
    finalState: {},
    potionsConsumed: {},
  })),
}));

vi.mock("@/lib/server/isAdmin", () => ({
  requireAdmin: vi.fn(async () => null),
  currentAdminEmail: vi.fn(async () => "admin@example.com"),
}));

vi.mock("@/lib/server/adminAudit", () => ({ logAdminAction: audit }));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ id: "target" }]),
          then: (resolve: (value: unknown) => unknown) => resolve(saveRows),
        })),
      })),
    })),
  },
}));

vi.mock("@/lib/server/derivePlayerCombatV2", () => ({
  derivePlayerCombatV2FromSaves: vi.fn(() => ({
    maxHp: 500,
    weaponElement: "neutral",
    player: {
      hp: 1,
      mp: 0,
      maxMp: 100,
      atk: 120,
      magicAtk: 20,
      def: 80,
      magicDef: 40,
      spd: 30,
      accuracyPct: 15,
      evasionPct: 10,
      critPct: 20,
    },
  })),
}));

vi.mock("@/lib/server/v2Skills", () => ({
  sanitizeCombatLoadout: vi.fn(() => ({ learned: [], equipped: [] })),
}));

vi.mock("@/adventure/v2/combat/engine", () => ({
  resolveBattle: resolveBattleMock,
}));

vi.mock("@/adventure/data/v2/replayPayload", () => ({
  toReplayPayload: vi.fn(() => ({
    playerMaxHp: 500,
    playerMaxMp: 100,
    enemy: { name: "모래도마뱀", hp: 100, atk: 10, def: 5, spd: 5, exp: 0 },
    log: [],
  })),
}));

import { POST } from "./route";

function request(body: unknown): Request {
  return new Request("http://test/api/admin/users/character-preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/users/character-preview", () => {
  beforeEach(() => {
    audit.mockClear();
    resolveBattleMock.mockClear();
  });

  it("대상 세이브를 수정하지 않고 실제 사냥 스케일로 체험한다", async () => {
    const response = await POST(
      request({ userId: "target", depth: 7, enemyKey: "모래도마뱀" }),
    );
    const json = (await response.json()) as {
      ok?: boolean;
      result?: { outcome?: string; profile?: { name?: string }; startPlayerHp?: number };
    };

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.result).toMatchObject({
      outcome: "win",
      profile: { name: "체험자" },
      startPlayerHp: 500,
    });
    expect(resolveBattleMock).toHaveBeenCalledOnce();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "character.preview",
        targetUserId: "target",
      }),
    );
  });

  it("대상 캐릭터가 아직 도달하지 못한 깊이는 거절한다", async () => {
    const response = await POST(
      request({ userId: "target", depth: 20, enemyKey: "동굴 거미" }),
    );
    const json = (await response.json()) as { error?: string; availableDepth?: number };

    expect(response.status).toBe(400);
    expect(json).toEqual({ ok: false, error: "depth_locked", availableDepth: 13 });
    expect(resolveBattleMock).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});
