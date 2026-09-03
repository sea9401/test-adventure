import { beforeEach, describe, expect, it, vi } from "vitest";

const { derivePlayerCombatV2, lockSaveForUpdate, readSave } = vi.hoisted(() => ({
  derivePlayerCombatV2: vi.fn(),
  lockSaveForUpdate: vi.fn(),
  readSave: vi.fn(),
}));

vi.mock("@/adventure/data/v2/coreLoopConfig", () => ({
  V2_CORE_LOOP_V2: false,
}));
vi.mock("@/lib/server/derivePlayerCombatV2", () => ({
  derivePlayerCombatV2,
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate,
  readSave,
}));

import { prepareV2BattleActor } from "./v2BattlePrep";

describe("v2 전투 준비", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readSave.mockImplementation(
      async (_tx: unknown, _userId: string, key: string, fallback: unknown) => {
        if (key === "equipment.v2") return { weapon: "practice-sword" };
        if (key === "skills.v2") return { equipped: [] };
        if (key === "proficiency.v2") return { groups: {} };
        return fallback;
      },
    );
    derivePlayerCombatV2.mockResolvedValue({
      maxHp: 500,
      player: { hp: 500, maxHp: 500, mp: 40, maxMp: 40 },
    });
  });

  it("읽기 전용 전투는 장비·스킬·숙련 저장값에 행 잠금을 걸지 않는다", async () => {
    const tx = {} as never;

    const result = await prepareV2BattleActor({
      tx,
      userId: "u1",
      charSave: { level: 80 },
      lockForUpdate: false,
    });

    expect(result).not.toBeNull();
    expect(lockSaveForUpdate).not.toHaveBeenCalled();
    expect(readSave.mock.calls.map((call) => call[2])).toEqual([
      "equipment.v2",
      "skills.v2",
      "proficiency.v2",
    ]);
    expect(derivePlayerCombatV2).toHaveBeenCalledWith("u1", tx, {
      character: { level: 80 },
      equipmentSave: { weapon: "practice-sword" },
      proficiencyRaw: { groups: {} },
      skillsRaw: { equipped: [] },
      includeCookingBuff: true,
    });
  });
});
