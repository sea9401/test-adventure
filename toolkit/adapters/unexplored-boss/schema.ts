const BOSS_ID_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const TASK_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;
const MODULE_NAME_PATTERN = /^[a-z][A-Za-z0-9]*$/;
const HANGUL_PATTERN = /[가-힣]/;
const EQUIPMENT_SLOTS = [
  "weapon",
  "armor",
  "gloves",
  "boots",
  "ring",
  "necklace",
] as const;
const EQUIPMENT_CONCEPTS = [
  "str",
  "dex",
  "int",
  "heavy",
  "light",
  "luck",
  "mana",
] as const;
const OPTION_KEYS = [
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
const DROP_CHANCES = [30, 10, 0.5] as const;
const IMAGE_ROLES = ["boss", "drop-30", "drop-10", "drop-rare"] as const;

export type EquipmentDropSpec = {
  id: string;
  name: string;
  description: string;
  slot: (typeof EQUIPMENT_SLOTS)[number];
  concept: (typeof EQUIPMENT_CONCEPTS)[number];
  tier: 16;
  power: number;
  weight: number;
  options: Readonly<Record<string, number>>;
  image: string;
  chancePct: (typeof DROP_CHANCES)[number];
};

export type ImageSpec = {
  role: (typeof IMAGE_ROLES)[number];
  target: string;
  requiresAlpha: boolean;
  rightsSource: "operator-cleared-game-art";
};

export type UnexploredBossSpecV1 = {
  version: 1;
  taskId: string;
  id: string;
  name: string;
  pools: readonly [string, string];
  summon: { materialId: string; name: string; description: string };
  boss: {
    sharedMaxHp: number;
    anchorDepth: number;
    monster: {
      hp: number;
      atk: number;
      atkType?: "physical" | "magic";
      def: number;
      magicDef: number;
      spd: number;
      accuracy: number;
      evasionPct: number;
      skill: Readonly<Record<string, string | number>>;
    };
    traits: readonly [string, string, string];
  };
  drops: readonly [EquipmentDropSpec, EquipmentDropSpec, EquipmentDropSpec];
  title: {
    id: string;
    name: string;
    description: string;
    condition: string;
    category: "battle" | "endgame";
  };
  achievement: { id: string; name: string; description: string };
  mechanic: {
    moduleName: string;
    persistedState: boolean;
    statusUi: boolean;
  };
  images: readonly [ImageSpec, ImageSpec, ImageSpec, ImageSpec];
};

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(
        path === "spec"
          ? `unknown key ${key}`
          : `${path} has unknown key ${key}`,
      );
    }
  }
  for (const key of allowed) {
    if (!(key in value)) {
      throw new Error(`${path}.${key} is required`);
    }
  }
}

function optionalExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  path: string,
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${path} has unknown key ${key}`);
    }
  }
  for (const key of required) {
    if (!(key in value)) {
      throw new Error(`${path}.${key} is required`);
    }
  }
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function koreanCopy(value: unknown, path: string): string {
  const text = stringValue(value, path);
  if (!HANGUL_PATTERN.test(text)) {
    throw new Error(`${path} must contain Korean copy`);
  }
  return text;
}

function finiteNumber(value: unknown, path: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (Number.isInteger(value) && !Number.isSafeInteger(value))
  ) {
    throw new Error(`${path} must be a safe finite number`);
  }
  return value;
}

function positiveNumber(value: unknown, path: string): number {
  const number = finiteNumber(value, path);
  if (number <= 0) {
    throw new Error(`${path} must be positive`);
  }
  return number;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${path} must be boolean`);
  }
  return value;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${path} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function assertBossId(id: string): void {
  if (!BOSS_ID_PATTERN.test(id)) {
    throw new Error(`invalid boss id: ${id}`);
  }
}

export function bossModuleName(id: string): string {
  assertBossId(id);
  const [first, ...rest] = id.split("_");
  return `${first}${rest
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join("")}`;
}

export function bossImagePath(id: string): string {
  assertBossId(id);
  return `/images/monster/v2/unexplored-boss-${id.replaceAll("_", "-")}.webp`;
}

function equipmentImagePath(id: string): string {
  return `/images/equipment/${id.slice("v2_".length).replaceAll("_", "-")}.webp`;
}

function validateSkill(value: unknown): void {
  const skill = record(value, "boss.monster.skill");
  for (const [key, entry] of Object.entries(skill)) {
    if (
      (typeof entry !== "string" || entry.trim() === "") &&
      (typeof entry !== "number" ||
        !Number.isFinite(entry) ||
        (Number.isInteger(entry) && !Number.isSafeInteger(entry)))
    ) {
      throw new Error(
        `boss.monster.skill.${key} must be a string or finite number`,
      );
    }
  }
}

function validateOptions(value: unknown, path: string): void {
  const options = record(value, path);
  const allowed = new Set<string>(OPTION_KEYS);
  for (const [key, option] of Object.entries(options)) {
    if (!allowed.has(key)) {
      throw new Error(`${path} has unknown key ${key}`);
    }
    finiteNumber(option, `${path}.${key}`);
  }
}

function validateDrop(value: unknown, index: number): EquipmentDropSpec {
  const path = `drops[${index}]`;
  const drop = record(value, path);
  exactKeys(
    drop,
    [
      "id",
      "name",
      "description",
      "slot",
      "concept",
      "tier",
      "power",
      "weight",
      "options",
      "image",
      "chancePct",
    ],
    path,
  );
  const id = stringValue(drop.id, `${path}.id`);
  if (!/^v2_unexplored_[a-z0-9]+(?:_[a-z0-9]+)*$/.test(id)) {
    throw new Error(`${path}.id must start with v2_unexplored_`);
  }
  koreanCopy(drop.name, `${path}.name`);
  koreanCopy(drop.description, `${path}.description`);
  oneOf(drop.slot, EQUIPMENT_SLOTS, `${path}.slot`);
  oneOf(drop.concept, EQUIPMENT_CONCEPTS, `${path}.concept`);
  if (drop.tier !== 16) {
    throw new Error(`${path}.tier must equal 16`);
  }
  positiveNumber(drop.power, `${path}.power`);
  finiteNumber(drop.weight, `${path}.weight`);
  validateOptions(drop.options, `${path}.options`);
  const expectedImage = equipmentImagePath(id);
  if (drop.image !== expectedImage) {
    throw new Error(`${path}.image must equal ${expectedImage}`);
  }
  finiteNumber(drop.chancePct, `${path}.chancePct`);
  return structuredClone(drop) as EquipmentDropSpec;
}

function validateImage(
  value: unknown,
  index: number,
  expectedTarget: string,
): ImageSpec {
  const path = `images[${index}]`;
  const image = record(value, path);
  exactKeys(
    image,
    ["role", "target", "requiresAlpha", "rightsSource"],
    path,
  );
  const role = oneOf(image.role, IMAGE_ROLES, `${path}.role`);
  if (role !== IMAGE_ROLES[index]) {
    throw new Error(`${path}.role must equal ${IMAGE_ROLES[index]}`);
  }
  const target = stringValue(image.target, `${path}.target`);
  if (target.includes("..") || !target.endsWith(".webp")) {
    throw new Error(`${path}.target is not a safe WebP project path`);
  }
  if (target !== expectedTarget) {
    throw new Error(
      index === 0
        ? `${path}.target must match the boss image`
        : `${path}.target must match drops[${index - 1}].image`,
    );
  }
  const requiresAlpha = booleanValue(
    image.requiresAlpha,
    `${path}.requiresAlpha`,
  );
  if (requiresAlpha !== (index > 0)) {
    throw new Error(
      `${path}.requiresAlpha must be ${index > 0 ? "true" : "false"}`,
    );
  }
  if (image.rightsSource !== "operator-cleared-game-art") {
    throw new Error(
      `${path}.rightsSource must equal operator-cleared-game-art`,
    );
  }
  return structuredClone(image) as ImageSpec;
}

export function parseUnexploredBossSpec(input: unknown): UnexploredBossSpecV1 {
  const spec = record(input, "spec");
  exactKeys(
    spec,
    [
      "version",
      "taskId",
      "id",
      "name",
      "pools",
      "summon",
      "boss",
      "drops",
      "title",
      "achievement",
      "mechanic",
      "images",
    ],
    "spec",
  );
  if (spec.version !== 1) {
    throw new Error("version must equal 1");
  }
  const taskId = stringValue(spec.taskId, "taskId");
  if (!TASK_ID_PATTERN.test(taskId)) {
    throw new Error("taskId is invalid");
  }
  const id = stringValue(spec.id, "id");
  assertBossId(id);
  koreanCopy(spec.name, "name");

  if (!Array.isArray(spec.pools) || spec.pools.length !== 2) {
    throw new Error("pools must contain exactly two IDs");
  }
  const pools = spec.pools.map((pool, index) =>
    stringValue(pool, `pools[${index}]`),
  );
  if (pools.some((pool) => !BOSS_ID_PATTERN.test(pool)) || pools[0] === pools[1]) {
    throw new Error("pools must contain two distinct IDs");
  }

  const summon = record(spec.summon, "summon");
  exactKeys(summon, ["materialId", "name", "description"], "summon");
  const expectedMaterialId = `v2_unexplored_${id}_summon_stone`;
  if (summon.materialId !== expectedMaterialId) {
    throw new Error(`summon.materialId must equal ${expectedMaterialId}`);
  }
  koreanCopy(summon.name, "summon.name");
  koreanCopy(summon.description, "summon.description");

  const boss = record(spec.boss, "boss");
  exactKeys(boss, ["sharedMaxHp", "anchorDepth", "monster", "traits"], "boss");
  positiveNumber(boss.sharedMaxHp, "boss.sharedMaxHp");
  positiveNumber(boss.anchorDepth, "boss.anchorDepth");
  const monster = record(boss.monster, "boss.monster");
  optionalExactKeys(
    monster,
    ["hp", "atk", "def", "magicDef", "spd", "accuracy", "evasionPct", "skill"],
    ["atkType"],
    "boss.monster",
  );
  for (const field of ["hp", "atk", "def", "magicDef", "spd"] as const) {
    positiveNumber(monster[field], `boss.monster.${field}`);
  }
  finiteNumber(monster.accuracy, "boss.monster.accuracy");
  const evasion = finiteNumber(monster.evasionPct, "boss.monster.evasionPct");
  if (evasion < 0 || evasion > 100) {
    throw new Error("boss.monster.evasionPct must be between 0 and 100");
  }
  if (monster.atkType !== undefined) {
    oneOf(monster.atkType, ["physical", "magic"], "boss.monster.atkType");
  }
  validateSkill(monster.skill);
  if (!Array.isArray(boss.traits) || boss.traits.length !== 3) {
    throw new Error("boss.traits must contain exactly three entries");
  }
  boss.traits.forEach((trait, index) =>
    koreanCopy(trait, `boss.traits[${index}]`),
  );

  if (!Array.isArray(spec.drops) || spec.drops.length !== 3) {
    throw new Error("drops must contain exactly three entries");
  }
  const declaredDropIds = spec.drops.map((drop, index) =>
    stringValue(record(drop, `drops[${index}]`).id, `drops[${index}].id`),
  );
  if (new Set(declaredDropIds).size !== declaredDropIds.length) {
    throw new Error("drop equipment IDs must be distinct");
  }
  const drops = spec.drops.map(validateDrop);
  if (drops.some((drop, index) => drop.chancePct !== DROP_CHANCES[index])) {
    throw new Error("drop chances must be ordered as 30, 10, 0.5");
  }

  const title = record(spec.title, "title");
  exactKeys(
    title,
    ["id", "name", "description", "condition", "category"],
    "title",
  );
  const expectedTitleId = `v2_unexplored_${id}`;
  if (title.id !== expectedTitleId) {
    throw new Error(`title.id must equal ${expectedTitleId}`);
  }
  koreanCopy(title.name, "title.name");
  koreanCopy(title.description, "title.description");
  koreanCopy(title.condition, "title.condition");
  oneOf(title.category, ["battle", "endgame"], "title.category");

  const achievement = record(spec.achievement, "achievement");
  exactKeys(achievement, ["id", "name", "description"], "achievement");
  const expectedAchievementId = `defeat_${id}`;
  if (achievement.id !== expectedAchievementId) {
    throw new Error(`achievement.id must equal ${expectedAchievementId}`);
  }
  koreanCopy(achievement.name, "achievement.name");
  koreanCopy(achievement.description, "achievement.description");

  const mechanic = record(spec.mechanic, "mechanic");
  exactKeys(
    mechanic,
    ["moduleName", "persistedState", "statusUi"],
    "mechanic",
  );
  const expectedModule = bossModuleName(id);
  if (
    typeof mechanic.moduleName !== "string" ||
    !MODULE_NAME_PATTERN.test(mechanic.moduleName) ||
    mechanic.moduleName !== expectedModule
  ) {
    throw new Error(`mechanic.moduleName must equal ${expectedModule}`);
  }
  booleanValue(mechanic.persistedState, "mechanic.persistedState");
  booleanValue(mechanic.statusUi, "mechanic.statusUi");

  if (!Array.isArray(spec.images) || spec.images.length !== 4) {
    throw new Error("images must contain exactly four entries");
  }
  const expectedTargets = [
    `public${bossImagePath(id)}`,
    ...drops.map((drop) => `public${drop.image}`),
  ];
  spec.images.map((image, index) =>
    validateImage(image, index, expectedTargets[index]),
  );

  return structuredClone(spec) as UnexploredBossSpecV1;
}
