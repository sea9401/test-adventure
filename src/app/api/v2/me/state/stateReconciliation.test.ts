import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  getGuildId: vi.fn(),
  reconcileSkills: vi.fn(),
  ensureCharacter: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { transaction: mocks.transaction },
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: mocks.getGuildId,
}));
vi.mock("@/lib/server/v2Skills", () => ({
  reconcileV2EquippedSkillsWithResult: mocks.reconcileSkills,
}));
vi.mock("@/lib/server/v2Character", () => ({
  ensureV2Character: mocks.ensureCharacter,
}));

describe("state read reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback({ id: "tx" }));
    mocks.getGuildId.mockResolvedValue(7);
    mocks.reconcileSkills.mockResolvedValue({ migration: { refundedSp: 3 } });
    mocks.ensureCharacter.mockResolvedValue(undefined);
  });

  it.each([
    [true, false],
    [false, true],
  ])(
    "coreView=%s reconciles dependencies with consumeJobSpNotice=%s",
    async (coreView, consumeJobSpNotice) => {
      const reconciliationModule = await import("./stateReconciliation");

      const result = await reconciliationModule.reconcileStateReadDependencies(
        "state-user",
        coreView,
      );

      expect(result).toEqual({
        guildId: 7,
        jobSpMigration: { refundedSp: 3 },
      });
      expect(mocks.reconcileSkills).toHaveBeenCalledWith(
        { id: "tx" },
        "state-user",
        { consumeJobSpNotice },
      );
      expect(mocks.ensureCharacter).toHaveBeenCalledWith(
        { id: "tx" },
        "state-user",
      );
    },
  );
});
