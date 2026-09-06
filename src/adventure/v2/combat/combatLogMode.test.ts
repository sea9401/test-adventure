import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveBattle, type PlayerCombat, type ResolveContext } from "./engine";
import { resolveBattlePvP } from "./engine-pvp";
import type { Monster } from "@/adventure/data/monsters";
import { initialInvincibleFortressState } from "./invincibleFortressMechanic";
import { initialSkywardCrystalEyeState } from "./skywardCrystalEyeMechanic";
import { initialImmortalBerserkerState } from "./immortalBerserkerMechanic";

const player: PlayerCombat = { hp: 1000, maxHp: 1000, atk: 30, def: 10, spd: 500, evasionPct: 0, attackCount: 1, accuracyPct: 100 };
const enemy: Monster = { name: "log test", hp: 5000, atk: 10, def: 5, spd: 6, exp: 0, tags: [] };
afterEach(() => vi.restoreAllMocks());
describe("bounded combat logs", () => {
  it.each(["glacial_colossus", "toxic_blood_lord", "tracking_weapon", "invincible_fortress", "skyward_crystal_eye", "immortal_berserker"] as const)("retains action-local mechanics for %s", (kind) => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const run = (logMode: "full" | "summary") => resolveBattle(
      { ...player, hp: 1_000_000, maxHp: 1_000_000, spd: 77 },
      { ...enemy, hp: 100_000 }, "test", {
        logMode, potions: {}, pickAction: () => ({ kind: "attack" }),
        maxTurns: 30, isBoss: true,
        damageMeter: { continueAfterDefeat: true, refillHp: 100_000 },
        bossMechanic: kind === "tracking_weapon" ? { kind, initialThreat: 0 }
          : kind === "invincible_fortress" ? { kind, sharedMaxHp: 100_000, initialState: initialInvincibleFortressState(100_000) }
          : kind === "skyward_crystal_eye" ? { kind, sharedMaxHp: 100_000, initialState: initialSkywardCrystalEyeState() }
          : kind === "immortal_berserker" ? { kind, sharedMaxHp: 100_000, initialState: initialImmortalBerserkerState(100_000) }
          : { kind },
      },
    );
    const full = run("full");
    expect(full.finalState.bossMechanic?.kind).toBe(kind);
    expect(run("summary")).toEqual({ ...full, finalState: { ...full.finalState, log: [] } });
  });

  it.each([false, true])("summary preserves complete PvE state (damage meter %s) with bounded action history", (meter) => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const run = (logMode: "full" | "summary") => {
      let retained = 0;
      const ctx: ResolveContext = {
        potions: {}, logMode, maxTurns: 30,
        pickAction: (state) => { retained = Math.max(retained, state.log.length); return { kind: "attack" }; },
        ...(meter ? { damageMeter: { continueAfterDefeat: true as const, refillHp: 5000 } } : {}),
      };
      return { result: resolveBattle(player, enemy, "test", ctx), retained };
    };
    const full = run("full"), summary = run("summary");
    expect(full.result.finalState.log.length).toBeGreaterThan(20);
    expect(summary.result.finalState.log).toEqual([]);
    expect(summary.retained).toBeLessThan(full.retained);
    expect(summary.result).toEqual({ ...full.result, finalState: { ...full.result.finalState, log: [] } });
    expect(run("full").result).toEqual(full.result);
  });

  it("preserves PvP state without retaining the completed replay", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const run = (logMode: "full" | "summary") => resolveBattlePvP(player, player, "A", "B", {
      logMode, pickAction: () => ({ kind: "attack" }), potions: { p1: {}, p2: {} },
    });
    const full = run("full");
    expect(full.finalState.log.length).toBeGreaterThan(20);
    expect(run("summary")).toEqual({ ...full, finalState: { ...full.finalState, log: [] } });
  });
});
