import { beforeEach, describe, expect, it, vi } from "vitest";
import { derivePlayerCombatV2FromSaves } from "@/lib/server/derivePlayerCombatV2FromSaves";

const mocks = vi.hoisted(() => ({
  character: {} as Record<string, unknown>,
  resolveBattle: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { select: () => ({ from: () => ({ where: async () => [] }) }) },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "viewer"),
}));
vi.mock("@/lib/server/highCostRateLimit", () => ({
  enforceHighCostRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/codexSpBonus", () => ({
  readCodexSpBonus: vi.fn(async () => ({ total: 0 })),
}));
vi.mock("@/lib/server/jobUnlockContext", () => ({
  readJobUnlockContext: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/v2Skills", () => ({
  sanitizeCombatLoadout: vi.fn((skills: unknown) => skills),
}));
// 세이브 읽기만 대신하고, 음식·준비물 포함 여부는 라우트가 넘긴 값 그대로 실제 계산에 태운다.
vi.mock("@/lib/server/derivePlayerCombatV2", () => ({
  derivePlayerCombatV2: vi.fn(
    async (_userId: string, _tx: unknown, options?: { includeCookingBuff?: boolean }) =>
      derivePlayerCombatV2FromSaves({
        character: mocks.character,
        equipmentSave: {},
        proficiencyRaw: {},
        skillsRaw: {},
        includeCookingBuff: options?.includeCookingBuff,
      }),
  ),
}));
vi.mock("@/adventure/v2/combat/engine", () => ({
  resolveBattle: mocks.resolveBattle,
}));
vi.mock("@/adventure/data/v2/replayPayload", () => ({
  toFullReplayPayload: vi.fn(() => ({ log: [] })),
}));

import { POST } from "./route";

const future = Date.now() + 60_000;
const plainCharacter = { level: 100 };

function sparRequest() {
  return new Request("http://local/api/v2/training/spar", { method: "POST" });
}

async function sparPlayer(character: Record<string, unknown>) {
  mocks.character = character;
  const response = await POST(sparRequest());
  expect(response.status).toBe(200);
  return mocks.resolveBattle.mock.calls.at(-1)![0] as {
    atk: number;
    hp: number;
    maxHp: number;
    mp?: number;
    maxMp?: number;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveBattle.mockReturnValue({
    outcome: "lose",
    turns: 50,
    finalState: { enemyHp: 0 },
  });
});

describe("POST /api/v2/training/spar", () => {
  // 건의 #862 — 허수아비 대련은 사냥 빌드를 재 보는 곳이라 사냥에 붙는 효과를 그대로 싣는다.
  it("켜 둔 전투 준비물을 허수아비 대련에 반영한다", async () => {
    const plain = await sparPlayer(plainCharacter);
    const prepared = await sparPlayer({
      ...plainCharacter,
      activeBattlePreps: {
        weapon: { itemId: "v2_prep_whetstone_3", expiresAt: future },
        armor: { itemId: "v2_prep_brace_3", expiresAt: future },
        vigor: { itemId: "v2_prep_fishoil_2", expiresAt: future },
      },
    });

    expect(prepared.atk - plain.atk).toBe(130);
    expect(prepared.maxHp - plain.maxHp).toBe(1_000);
    expect(prepared.hp).toBe(prepared.maxHp);
    expect((prepared.maxMp ?? 0) - (plain.maxMp ?? 0)).toBe(500);
    expect(prepared.mp).toBe(prepared.maxMp);
  });

  it("먹어 둔 음식 효과도 허수아비 대련에 반영한다", async () => {
    const plain = await sparPlayer(plainCharacter);
    const fed = await sparPlayer({
      ...plainCharacter,
      activeFoodBuff: {
        recipeId: "flame_corn_stew",
        recipeName: "불꽃 옥수수 스튜",
        quality: "normal",
        effect: { combatFlat: { atk: 50 } },
        expiresAt: future,
      },
    });

    expect(fed.atk - plain.atk).toBe(50);
  });
});
