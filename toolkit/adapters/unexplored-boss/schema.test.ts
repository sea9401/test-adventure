import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";

import {
  bossImagePath,
  bossModuleName,
  parseUnexploredBossSpec,
} from "./schema";

let fixture: Record<string, unknown>;

beforeAll(async () => {
  fixture = parse(
    await readFile(
      new URL(
        "../../testing/fixtures/specs/unexplored-boss.yaml",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as Record<string, unknown>;
});

function validBossInput(
  override: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...structuredClone(fixture), ...override };
}

describe("parseUnexploredBossSpec", () => {
  it("parses the complete version-one boss contract", () => {
    const spec = parseUnexploredBossSpec(validBossInput());

    expect(spec).toMatchObject({
      version: 1,
      taskId: "boss-echo-warden",
      id: "echo_warden",
      pools: ["runaway_machines", "shadow_stalkers"],
      drops: [
        { chancePct: 30 },
        { chancePct: 10 },
        { chancePct: 0.5 },
      ],
      mechanic: {
        moduleName: "echoWarden",
        persistedState: true,
        statusUi: true,
      },
    });
  });

  it.each([
    [
      "duplicate pools",
      () => ({ pools: ["runaway_machines", "runaway_machines"] }),
      "pools must contain two distinct IDs",
    ],
    [
      "wrong drop order",
      () => {
        const drops = structuredClone(fixture.drops) as Record<string, unknown>[];
        return { drops: [drops[1], drops[0], drops[2]] };
      },
      "drop chances must be ordered as 30, 10, 0.5",
    ],
    ["unknown root key", () => ({ unexpected: true }), "unknown key unexpected"],
    [
      "unknown nested key",
      () => ({
        mechanic: {
          ...(fixture.mechanic as Record<string, unknown>),
          invented: true,
        },
      }),
      "mechanic has unknown key invented",
    ],
  ])("rejects %s", (_name, override, message) => {
    expect(() => parseUnexploredBossSpec(validBossInput(override()))).toThrow(
      message,
    );
  });

  it("rejects unsafe numeric and nested skill values", () => {
    const boss = structuredClone(fixture.boss) as Record<string, unknown>;
    boss.sharedMaxHp = Number.MAX_SAFE_INTEGER + 1;
    expect(() => parseUnexploredBossSpec(validBossInput({ boss }))).toThrow(
      "boss.sharedMaxHp must be a safe finite number",
    );

    const nestedBoss = structuredClone(fixture.boss) as Record<string, unknown>;
    const monster = nestedBoss.monster as Record<string, unknown>;
    monster.skill = { kind: "echo", nested: { multiplier: 2 } };
    expect(() =>
      parseUnexploredBossSpec(validBossInput({ boss: nestedBoss })),
    ).toThrow("boss.monster.skill.nested must be a string or finite number");
  });

  it("rejects duplicate equipment IDs and the wrong fixed tier", () => {
    const drops = structuredClone(fixture.drops) as Record<string, unknown>[];
    drops[1].id = drops[0].id;
    expect(() => parseUnexploredBossSpec(validBossInput({ drops }))).toThrow(
      "drop equipment IDs must be distinct",
    );

    const wrongTier = structuredClone(fixture.drops) as Record<string, unknown>[];
    wrongTier[0].tier = 15;
    expect(() =>
      parseUnexploredBossSpec(validBossInput({ drops: wrongTier })),
    ).toThrow("drops[0].tier must equal 16");
  });

  it("rejects image path traversal and identifier mismatches", () => {
    const images = structuredClone(fixture.images) as Record<string, unknown>[];
    images[0].target = "public/images/monster/v2/../../outside.webp";
    expect(() => parseUnexploredBossSpec(validBossInput({ images }))).toThrow(
      "images[0].target",
    );

    const mismatched = structuredClone(fixture.images) as Record<string, unknown>[];
    mismatched[1].target = "public/images/equipment/unexplored-wrong.webp";
    expect(() =>
      parseUnexploredBossSpec(validBossInput({ images: mismatched })),
    ).toThrow("images[1].target must match drops[0].image");
  });

  it("rejects invalid prefixes, module names, and non-Korean copy", () => {
    expect(() =>
      parseUnexploredBossSpec(
        validBossInput({
          summon: {
            ...(fixture.summon as Record<string, unknown>),
            materialId: "wrong_material",
          },
        }),
      ),
    ).toThrow("summon.materialId must equal v2_unexplored_echo_warden_summon_stone");

    expect(() =>
      parseUnexploredBossSpec(
        validBossInput({
          mechanic: {
            ...(fixture.mechanic as Record<string, unknown>),
            moduleName: "Echo-Warden",
          },
        }),
      ),
    ).toThrow("mechanic.moduleName must equal echoWarden");

    expect(() =>
      parseUnexploredBossSpec(validBossInput({ name: "Echo Warden" })),
    ).toThrow("name must contain Korean copy");
  });
});

describe("boss naming helpers", () => {
  it("maps lower snake-case IDs to code and image names", () => {
    expect(bossModuleName("echo_warden")).toBe("echoWarden");
    expect(bossImagePath("echo_warden")).toBe(
      "/images/monster/v2/unexplored-boss-echo-warden.webp",
    );
  });

  it("rejects malformed boss IDs", () => {
    expect(() => bossModuleName("Echo-Warden")).toThrow("invalid boss id");
  });
});
