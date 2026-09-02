import type { EquipmentDropSpec, UnexploredBossSpecV1 } from "./schema";
import { bossImagePath } from "./schema";

const OPTION_ORDER = [
  "crit",
  "eva",
  "accuracy",
  "mp",
  "hp",
  "critMult",
  "spd",
  "def",
  "magicDef",
  "healPowerPct",
  "critResist",
  "statusDamageReductionPct",
] as const;

type RenderValue =
  | string
  | number
  | boolean
  | null
  | readonly RenderValue[]
  | { readonly [key: string]: RenderValue };

function indent(level: number): string {
  return "  ".repeat(level);
}

function propertyKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

function numberLiteral(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("cannot render a non-finite number");
  }
  return Object.is(value, -0) ? "0" : String(value);
}

function renderValue(
  value: RenderValue,
  level: number,
  newline: "\n" | "\r\n",
): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return numberLiteral(value);
  }
  if (typeof value === "boolean" || value === null) {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    return `[${newline}${value
      .map(
        (entry) =>
          `${indent(level + 1)}${renderValue(entry, level + 1, newline)},`,
      )
      .join(newline)}${newline}${indent(level)}]`;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return "{}";
  }
  return `{${newline}${entries
    .map(
      ([key, entry]) =>
        `${indent(level + 1)}${propertyKey(key)}: ${renderValue(
          entry,
          level + 1,
          newline,
        )},`,
    )
    .join(newline)}${newline}${indent(level)}}`;
}

function renderObjectProperty(
  propertyName: string,
  value: { readonly [key: string]: RenderValue },
  newline: "\n" | "\r\n",
): string {
  return `${indent(1)}${propertyKey(propertyName)}: ${renderValue(
    value,
    1,
    newline,
  )},${newline}`;
}

function orderedRecord(
  source: Readonly<Record<string, string | number>>,
  order: readonly string[],
): Readonly<Record<string, string | number>> {
  const rank = new Map(order.map((key, index) => [key, index]));
  return Object.fromEntries(
    Object.entries(source).sort(([left], [right]) => {
      const leftRank = rank.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rank.get(right) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.localeCompare(right);
    }),
  );
}

export function renderSummonMaterial(
  spec: UnexploredBossSpecV1,
  newline: "\n" | "\r\n" = "\n",
): string {
  return renderObjectProperty(
    spec.summon.materialId,
    {
      id: spec.summon.materialId,
      name: spec.summon.name,
      description: spec.summon.description,
    },
    newline,
  );
}

function dropReference(drop: EquipmentDropSpec): RenderValue {
  return {
    equipmentId: drop.id,
    equipmentName: drop.name,
    chancePct: drop.chancePct,
  };
}

export function renderBossDefinition(
  spec: UnexploredBossSpecV1,
  newline: "\n" | "\r\n" = "\n",
): string {
  const skill = orderedRecord(spec.boss.monster.skill, []);
  const monster: Record<string, RenderValue> = {
    name: spec.name,
    tags: [],
    image: bossImagePath(spec.id),
    hp: spec.boss.monster.hp,
    atk: spec.boss.monster.atk,
    ...(spec.boss.monster.atkType === undefined
      ? {}
      : { atkType: spec.boss.monster.atkType }),
    def: spec.boss.monster.def,
    magicDef: spec.boss.monster.magicDef,
    spd: spec.boss.monster.spd,
    accuracy: spec.boss.monster.accuracy,
    evasionPct: spec.boss.monster.evasionPct,
    exp: 0,
    ...(Object.keys(skill).length === 0 ? {} : { skill }),
    armorVulnerable: 0.35,
    playerDefVulnerable: 0.35,
    dropQualityBias: 4,
    v2MaxMp: 0,
  };
  return renderObjectProperty(
    spec.id,
    {
      id: spec.id,
      name: spec.name,
      pools: spec.pools,
      summonMaterialId: spec.summon.materialId,
      uniqueDrops: spec.drops.map(dropReference),
      titleId: spec.title.id,
      sharedMaxHp: spec.boss.sharedMaxHp,
      anchorDepth: spec.boss.anchorDepth,
      monster,
      traits: spec.boss.traits,
    },
    newline,
  );
}

function equipmentDefinition(drop: EquipmentDropSpec): RenderValue {
  return {
    id: drop.id,
    slot: drop.slot,
    concept: drop.concept,
    tier: drop.tier,
    name: drop.name,
    description: drop.description,
    image: drop.image,
    power: drop.power,
    weight: drop.weight,
    options: orderedRecord(drop.options, OPTION_ORDER),
    rarity: "unique",
    noDrop: true,
  };
}

export function renderEquipmentEntries(
  spec: UnexploredBossSpecV1,
  newline: "\n" | "\r\n" = "\n",
): readonly string[] {
  return spec.drops.map((drop) =>
    renderObjectProperty(
      drop.id,
      equipmentDefinition(drop) as { readonly [key: string]: RenderValue },
      newline,
    ),
  );
}

export function renderTitle(
  spec: UnexploredBossSpecV1,
  newline: "\n" | "\r\n" = "\n",
): string {
  return renderObjectProperty(
    spec.title.id,
    {
      id: spec.title.id,
      name: spec.title.name,
      description: spec.title.description,
      condition: spec.title.condition,
      category: spec.title.category,
    },
    newline,
  );
}

export function renderBossAchievementMapping(
  spec: UnexploredBossSpecV1,
  newline: "\n" | "\r\n" = "\n",
): string {
  return `${indent(1)}${propertyKey(spec.id)}: ${JSON.stringify(
    spec.achievement.id,
  )},${newline}`;
}

export function renderAchievement(
  spec: UnexploredBossSpecV1,
  newline: "\n" | "\r\n" = "\n",
): string {
  return `${indent(1)}${renderValue(
    {
      id: spec.achievement.id,
      name: spec.achievement.name,
      description: spec.achievement.description,
    },
    1,
    newline,
  )},${newline}`;
}
