import { describe, expect, it } from "vitest";
import type { Monster } from "@/adventure/data/monsters/types";
import {
  GRID_DUNGEON_PARTY_SCALING,
  makeGridDungeonPartyActor,
  resolveGridDungeonPartyCombat,
} from "@/adventure/data/v2/gridDungeonCombat";
import type {
  GridDungeonSupporterSnapshot,
  GridDungeonTileKind,
} from "@/adventure/data/v2/gridDungeon";
import { smartDefaultPatternFromEquipped } from "@/adventure/data/v2/v2Skills";

function monster(name: string, hp: number, atk: number, def: number, spd: number): Monster {
  return {
    name,
    tags: ["undead"],
    hp,
    atk,
    def,
    spd,
    exp: 0,
  };
}

function supporter(
  partial: Partial<GridDungeonSupporterSnapshot> & {
    userId: string;
    name: string;
  },
): GridDungeonSupporterSnapshot {
  const skills = partial.skills ?? [];
  return {
    userId: partial.userId,
    name: partial.name,
    level: partial.level ?? 30,
    job: partial.job ?? "모험가",
    supportRole: partial.supportRole ?? null,
    maxHp: partial.maxHp ?? 420,
    maxMp: partial.maxMp ?? 420,
    mp: partial.mp ?? partial.maxMp ?? 420,
    atk: partial.atk ?? 70,
    magicAtk: partial.magicAtk ?? 0,
    def: partial.def ?? 25,
    spd: partial.spd ?? 10,
    healMult: partial.healMult ?? 1,
    element: partial.element ?? "neutral",
    skills,
    pattern: partial.pattern ?? smartDefaultPatternFromEquipped(skills),
    capturedAt: partial.capturedAt ?? 100,
  };
}

function mainActor() {
  return makeGridDungeonPartyActor({
    id: "me",
    name: "나",
    maxHp: 520,
    atk: 95,
    magicAtk: 30,
    def: 35,
    spd: 10,
    healMult: 1,
    isMain: true,
  });
}

const dps = () =>
  supporter({
    userId: "dps",
    name: "딜러",
    job: "전사",
    maxHp: 430,
    atk: 86,
    def: 24,
    spd: 13,
    skills: ["v2c_warrior_strike"],
  });

const healer = () =>
  supporter({
    userId: "healer",
    name: "힐러",
    job: "사제",
    maxHp: 360,
    maxMp: 520,
    mp: 520,
    atk: 34,
    magicAtk: 82,
    def: 20,
    spd: 9,
    healMult: 1.25,
    skills: ["v2c_acolyte_smite"],
    pattern: {
      blocks: [
        {
          condition: { kind: "self_hp", op: "below", pct: 75 },
          action: { kind: "role", role: "heal" },
        },
      ],
    },
  });

const tank = () =>
  supporter({
    userId: "tank",
    name: "탱커",
    job: "가디언",
    maxHp: 760,
    atk: 56,
    def: 70,
    spd: 7,
    skills: ["v2c_guardian_bash"],
  });

function runRoom(
  kind: GridDungeonTileKind,
  supporters: readonly GridDungeonSupporterSnapshot[],
  frontlineId?: string,
) {
  const enemies: Partial<Record<GridDungeonTileKind, Monster>> = {
    monster: monster("일반 방", 420, 55, 20, 8),
    elite: monster("정예 방", 760, 82, 32, 9),
    boss: monster("보스 방", 1600, 125, 50, 10),
  };
  const enemy = enemies[kind];
  if (!enemy) throw new Error(`missing enemy for ${kind}`);
  return resolveGridDungeonPartyCombat({
    main: mainActor(),
    supporters: [...supporters],
    enemy,
    scaling: GRID_DUNGEON_PARTY_SCALING[kind] ?? {
      hpPerSupporter: 0.45,
      atkPerSupporter: 0.16,
    },
    frontlineId,
  });
}

describe("gridDungeon party combat simulations", () => {
  it.each([
    ["monster solo", "monster", []],
    ["monster + dps", "monster", [dps()]],
    ["monster + dps/healer", "monster", [dps(), healer()]],
    ["elite + dps", "elite", [dps()]],
    ["elite + dps/healer", "elite", [dps(), healer()]],
    ["boss + dps/healer", "boss", [dps(), healer()]],
  ] as const)("%s clears", (_label, kind, supporters) => {
    const result = runRoom(kind, supporters);
    expect(result.outcome).toBe("win");
    expect(result.playerHpAfter).toBeGreaterThan(0);
    expect(result.turns).toBeGreaterThan(0);
  });

  it.each([
    ["boss solo", []],
    ["boss + healer", [healer()]],
    ["boss + tank/healer", [tank(), healer()]],
  ] as const)("%s keeps boss pressure visible", (_label, supporters) => {
    const result = runRoom("boss", supporters);
    expect(result.outcome).toBe("lose");
    expect(result.enemyHp).toBeGreaterThan(0);
    expect(result.party.find((member) => member.id === "me")?.damageTaken).toBeGreaterThan(0);
  });

  it("healer support records healing and skill usage when pressure is high", () => {
    const result = runRoom("boss", [dps(), healer()]);
    const healerResult = result.party.find((member) => member.id === "healer");
    expect(healerResult?.healingDone).toBeGreaterThan(0);
    expect(healerResult?.skillUses).toMatchObject({ "치유": expect.any(Number) });
  });

  it("supporter selection order is preserved for future formation rules", () => {
    const result = runRoom("elite", [tank(), dps()]);
    expect(result.party.map((member) => member.id)).toEqual(["me", "tank", "dps"]);
  });

  it("frontline formation draws more enemy attacks when assigned", () => {
    const result = runRoom("boss", [tank(), dps()], "tank");
    const tankResult = result.party.find((member) => member.id === "tank");
    const dpsResult = result.party.find((member) => member.id === "dps");
    expect(tankResult?.formation).toBe("front");
    expect(dpsResult?.formation).toBe("back");
    expect(tankResult?.damageTaken ?? 0).toBeGreaterThan(dpsResult?.damageTaken ?? 0);
  });

  it("recommended dps and healer party still clears with main in front", () => {
    const result = runRoom("boss", [dps(), healer()], "me");
    expect(result.outcome).toBe("win");
    expect(result.party.find((member) => member.id === "me")?.formation).toBe("front");
    expect(result.playerHpAfter).toBeGreaterThan(0);
  });

  it("defensive frontline protects the healer in tank and healer parties", () => {
    const mainFront = runRoom("boss", [tank(), healer()], "me");
    const tankFront = runRoom("boss", [tank(), healer()], "tank");
    expect(tankFront.outcome).toBe("win");
    expect(
      tankFront.party.find((member) => member.id === "healer")?.hpAfter ?? 0,
    ).toBeGreaterThan(
      mainFront.party.find((member) => member.id === "healer")?.hpAfter ?? 0,
    );
    expect(
      tankFront.party.find((member) => member.id === "tank")?.damageTaken ?? 0,
    ).toBeGreaterThan(
      tankFront.party.find((member) => member.id === "healer")?.damageTaken ?? 0,
    );
  });
});
