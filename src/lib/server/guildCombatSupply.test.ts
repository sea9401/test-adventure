import { describe, expect, it, vi } from "vitest";
import {
  readGuildCombatSupplyBonuses,
  readGuildCombatSupplyState,
} from "./guildCombatSupply";

function txWithBuffs(buffs: unknown) {
  const builder = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(async () => [{ buffs }]),
  };
  builder.from.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  return {
    tx: { select: vi.fn(() => builder) },
    select: builder,
  };
}

describe("guild combat supply server state", () => {
  it("reads permanent research and current-week operations from one guild row", async () => {
    const { tx, select } = txWithBuffs([
      { buffId: "combat_gold", tier: 10, installedAt: "2026-01-01T00:00:00Z" },
      { buffId: "combat_exp", tier: 4, installedAt: "2026-01-01T00:00:00Z" },
      {
        buffId: "combat_proficiency",
        tier: 7,
        installedAt: "2026-01-01T00:00:00Z",
      },
      {
        buffId: "combat_operations",
        tier: 2,
        installedAt: "2026-08-21T12:00:00.000Z",
      },
    ]);

    await expect(
      readGuildCombatSupplyState(
        tx as never,
        7,
        new Date("2026-08-22T00:00:00.000Z"),
      ),
    ).resolves.toEqual({
      levels: { combat_gold: 10, combat_exp: 4, combat_proficiency: 7 },
      operationsTier: 2,
    });
    expect(tx.select).toHaveBeenCalledOnce();
    expect(select.limit).toHaveBeenCalledWith(1);
  });

  it("ignores expired operations when producing hunt bonuses", async () => {
    const { tx } = txWithBuffs([
      { buffId: "combat_gold", tier: 10, installedAt: "2026-01-01T00:00:00Z" },
      { buffId: "combat_exp", tier: 4, installedAt: "2026-01-01T00:00:00Z" },
      {
        buffId: "combat_proficiency",
        tier: 7,
        installedAt: "2026-01-01T00:00:00Z",
      },
      {
        buffId: "combat_operations",
        tier: 3,
        installedAt: "2026-08-16T14:59:59.000Z",
      },
    ]);

    await expect(
      readGuildCombatSupplyBonuses(
        tx as never,
        7,
        new Date("2026-08-22T00:00:00.000Z"),
      ),
    ).resolves.toEqual({
      goldPct: 10,
      expPct: 4,
      proficiencyChancePct: 35,
    });
  });

  it("returns empty hunt bonuses without querying for a guildless player", async () => {
    const { tx } = txWithBuffs([]);

    await expect(
      readGuildCombatSupplyBonuses(
        tx as never,
        null,
        new Date("2026-08-22T00:00:00.000Z"),
      ),
    ).resolves.toEqual({
      goldPct: 0,
      expPct: 0,
      proficiencyChancePct: 0,
    });
    expect(tx.select).not.toHaveBeenCalled();
  });
});
