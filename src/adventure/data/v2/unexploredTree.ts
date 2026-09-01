import {
  UNEXPLORED_MONSTER_POOLS,
  UNEXPLORED_POOL_BY_ID,
  type UnexploredPoolId,
} from "./unexploredMonsterPools";
import type { UnexploredPoolSelection } from "./unexploredEncounters";

export const FRONT_UNEXPLORED_POOL_IDS = [
  "iron_legion",
  "mana_barrier",
  "regenerating_swarm",
  "red_berserkers",
  "crystal_artillery",
  "precision_hunters",
] as const satisfies readonly UnexploredPoolId[];

export const BOSS_UNEXPLORED_POOL_IDS = [
  "runaway_machines",
  "shadow_stalkers",
  "venom_colony",
  "bloodstained_dead",
  "frozen_legion",
  "crushing_colossi",
] as const satisfies readonly UnexploredPoolId[];

export type FrontUnexploredPoolId =
  (typeof FRONT_UNEXPLORED_POOL_IDS)[number];
export type BossUnexploredPoolId =
  (typeof BOSS_UNEXPLORED_POOL_IDS)[number];

export type UnexploredRewardKind =
  | "gold"
  | "base_material"
  | "equipment"
  | "quality"
  | "special_material";

export type UnexploredDifficultyRewardKind =
  | "gold"
  | "base"
  | "special"
  | "trace"
  | "rare_copy";

export type UnexploredDeepEffect =
  | "gold"
  | "collector"
  | "armory"
  | "contract"
  | "tracking"
  | "boss";

export type UnexploredNodeEffect =
  | { kind: "start" }
  | { kind: "reward"; reward: UnexploredRewardKind; pct: number }
  | {
      kind: "difficulty_reward";
      difficulty: 1 | 2 | 3 | 4;
      reward: UnexploredDifficultyRewardKind;
      amount: number;
    }
  | {
      kind: "pool_core";
      poolId: UnexploredPoolId;
      requestSharePct: 20;
    }
  | {
      kind: "pool_frequency";
      poolId: UnexploredPoolId;
      requestSharePct: 10;
    }
  | { kind: "pool_material"; poolId: UnexploredPoolId; pct: 20 }
  | { kind: "pool_loot"; poolId: FrontUnexploredPoolId; pct: 20 }
  | {
      kind: "pool_trace";
      poolId: BossUnexploredPoolId;
      extraChancePct: 20;
    }
  | { kind: "pool_focus"; poolId: UnexploredPoolId }
  | { kind: "deep"; effect: UnexploredDeepEffect };

export type UnexploredNodeKind =
  | "start"
  | "small"
  | "medium"
  | "pool"
  | "enhancer"
  | "deep";

export type UnexploredNode = {
  id: string;
  kind: UnexploredNodeKind;
  name: string;
  description: string;
  icon: string;
  x: number;
  y: number;
  angle: number;
  region: string;
  effects: readonly UnexploredNodeEffect[];
  poolId?: UnexploredPoolId;
};

export type UnexploredNodeId = string;
export type UnexploredEdge = readonly [UnexploredNodeId, UnexploredNodeId];

type NodeSeed = Omit<UnexploredNode, "angle"> & { angle?: number };

const CENTER = { x: 900, y: 900 };
const nodes: UnexploredNode[] = [];
const edges: UnexploredEdge[] = [];
const nodeById = new Map<string, UnexploredNode>();
const adjacency = new Map<string, Set<string>>();
const edgeKeys = new Set<string>();

function polar(radius: number, degree: number): { x: number; y: number } {
  const radians = degree * Math.PI / 180;
  return {
    x: Math.round((CENTER.x + Math.cos(radians) * radius) * 100) / 100,
    y: Math.round((CENTER.y + Math.sin(radians) * radius) * 100) / 100,
  };
}

function angleDifference(left: number, right: number): number {
  return Math.abs(((left - right + 540) % 360) - 180);
}

function addNode(seed: NodeSeed): UnexploredNode {
  if (nodeById.has(seed.id)) throw new Error(`Duplicate unexplored node: ${seed.id}`);
  const node: UnexploredNode = { ...seed, angle: seed.angle ?? -90 };
  nodes.push(node);
  nodeById.set(node.id, node);
  adjacency.set(node.id, new Set());
  return node;
}

function addEdge(left: string, right: string): void {
  if (left === right) throw new Error(`Self unexplored edge: ${left}`);
  if (!adjacency.has(left) || !adjacency.has(right)) {
    throw new Error(`Dangling unexplored edge: ${left}|${right}`);
  }
  const key = [left, right].sort().join("|");
  if (edgeKeys.has(key)) return;
  edgeKeys.add(key);
  edges.push([left, right]);
  adjacency.get(left)!.add(right);
  adjacency.get(right)!.add(left);
}

function nearestNodeIds(
  candidates: readonly UnexploredNode[],
  angle: number,
  count = 1,
): string[] {
  return [...candidates]
    .sort(
      (left, right) =>
        angleDifference(left.angle, angle) - angleDifference(right.angle, angle),
    )
    .slice(0, count)
    .map((node) => node.id);
}

const smallEffectSeeds: Array<{
  name: string;
  description: string;
  icon: string;
  effect: UnexploredNodeEffect;
}> = [
  ...Array.from({ length: 18 }, () => ({
    name: "골드 탐색",
    description: "미개척지 골드 획득량이 0.5% 증가합니다.",
    icon: "coin",
    effect: { kind: "reward", reward: "gold", pct: 0.5 } as const,
  })),
  ...Array.from({ length: 18 }, () => ({
    name: "재료 탐색",
    description: "일반 재료 획득량이 1% 증가합니다.",
    icon: "material",
    effect: { kind: "reward", reward: "base_material", pct: 1 } as const,
  })),
  ...Array.from({ length: 14 }, () => ({
    name: "장비 발견",
    description: "일반 장비 기대 획득량이 1% 증가합니다.",
    icon: "equipment",
    effect: { kind: "reward", reward: "equipment", pct: 1 } as const,
  })),
  ...Array.from({ length: 10 }, () => ({
    name: "품질 감식",
    description: "높은 품질 장비 등장 기대확률이 1% 증가합니다.",
    icon: "quality",
    effect: { kind: "reward", reward: "quality", pct: 1 } as const,
  })),
  ...Array.from({ length: 12 }, () => ({
    name: "특화 채집",
    description: "특화 몬스터 전용 재료 기대 획득량이 1% 증가합니다.",
    icon: "special-material",
    effect: { kind: "reward", reward: "special_material", pct: 1 } as const,
  })),
];

type MediumSeed = {
  name: string;
  description: string;
  icon: string;
  effects: readonly UnexploredNodeEffect[];
};

const mediumSeeds: readonly MediumSeed[] = [
  {
    name: "탐사 수익",
    description: "골드 획득량이 5% 증가합니다.",
    icon: "coin",
    effects: [{ kind: "reward", reward: "gold", pct: 5 }],
  },
  {
    name: "골드 보상 I",
    description: "난이도 +1, 골드 획득량 +10%.",
    icon: "coin-risk",
    effects: [{ kind: "difficulty_reward", difficulty: 1, reward: "gold", amount: 10 }],
  },
  {
    name: "채집 감식",
    description: "일반 재료 획득량이 8% 증가합니다.",
    icon: "material",
    effects: [{ kind: "reward", reward: "base_material", pct: 8 }],
  },
  {
    name: "기본 보상 I",
    description: "난이도 +1, 일반 재료·장비 기대 획득량 +10%.",
    icon: "base-risk",
    effects: [{ kind: "difficulty_reward", difficulty: 1, reward: "base", amount: 10 }],
  },
  {
    name: "장비 탐색",
    description: "일반 장비 기대 획득량이 8% 증가합니다.",
    icon: "equipment",
    effects: [{ kind: "reward", reward: "equipment", pct: 8 }],
  },
  {
    name: "특화 재료 I",
    description: "난이도 +1, 활성 특화 풀 전용 재료 +10%.",
    icon: "special-risk",
    effects: [{ kind: "difficulty_reward", difficulty: 1, reward: "special", amount: 10 }],
  },
  {
    name: "정교한 감식",
    description: "높은 품질 장비 등장 기대확률이 8% 증가합니다.",
    icon: "quality",
    effects: [{ kind: "reward", reward: "quality", pct: 8 }],
  },
  {
    name: "흔적 추적 I",
    description: "난이도 +2, 추가 흔적 획득 확률 +10%p.",
    icon: "trace-risk",
    effects: [{ kind: "difficulty_reward", difficulty: 2, reward: "trace", amount: 10 }],
  },
  {
    name: "특화 채집",
    description: "특화 몬스터 전용 재료 기대 획득량이 8% 증가합니다.",
    icon: "special-material",
    effects: [{ kind: "reward", reward: "special_material", pct: 8 }],
  },
  {
    name: "희귀 제작 I",
    description: "난이도 +3, 희귀 재료·아이템 획득 시 20% 확률로 1개 추가.",
    icon: "rare-risk",
    effects: [{ kind: "difficulty_reward", difficulty: 3, reward: "rare_copy", amount: 20 }],
  },
  {
    name: "풍부한 전리품",
    description: "일반 재료와 장비 기대 획득량이 각각 5% 증가합니다.",
    icon: "base",
    effects: [
      { kind: "reward", reward: "base_material", pct: 5 },
      { kind: "reward", reward: "equipment", pct: 5 },
    ],
  },
  {
    name: "골드 보상 II",
    description: "난이도 +2, 골드 획득량 +20%.",
    icon: "coin-risk",
    effects: [{ kind: "difficulty_reward", difficulty: 2, reward: "gold", amount: 20 }],
  },
  {
    name: "기본 보상 II",
    description: "난이도 +2, 일반 재료·장비 기대 획득량 +20%.",
    icon: "base-risk",
    effects: [{ kind: "difficulty_reward", difficulty: 2, reward: "base", amount: 20 }],
  },
  {
    name: "균형 잡힌 수확",
    description: "골드와 특화 몬스터 전용 재료가 각각 5% 증가합니다.",
    icon: "balanced",
    effects: [
      { kind: "reward", reward: "gold", pct: 5 },
      { kind: "reward", reward: "special_material", pct: 5 },
    ],
  },
  {
    name: "특화 재료 II",
    description: "난이도 +2, 활성 특화 풀 전용 재료 +20%.",
    icon: "special-risk",
    effects: [{ kind: "difficulty_reward", difficulty: 2, reward: "special", amount: 20 }],
  },
  {
    name: "흔적 추적 II",
    description: "난이도 +3, 추가 흔적 획득 확률 +20%p.",
    icon: "trace-risk",
    effects: [{ kind: "difficulty_reward", difficulty: 3, reward: "trace", amount: 20 }],
  },
  {
    name: "희귀 제작 II",
    description: "난이도 +4, 희귀 재료·아이템 획득 시 35% 확률로 1개 추가.",
    icon: "rare-risk",
    effects: [{ kind: "difficulty_reward", difficulty: 4, reward: "rare_copy", amount: 35 }],
  },
  {
    name: "기본 보상 III",
    description: "난이도 +3, 일반 재료·장비 기대 획득량 +35%.",
    icon: "base-risk",
    effects: [{ kind: "difficulty_reward", difficulty: 3, reward: "base", amount: 35 }],
  },
  {
    name: "특화 재료 III",
    description: "난이도 +3, 활성 특화 풀 전용 재료 +35%.",
    icon: "special-risk",
    effects: [{ kind: "difficulty_reward", difficulty: 3, reward: "special", amount: 35 }],
  },
  {
    name: "흔적 추적 III",
    description: "난이도 +4, 추가 흔적 획득 확률 +35%p.",
    icon: "trace-risk",
    effects: [{ kind: "difficulty_reward", difficulty: 4, reward: "trace", amount: 35 }],
  },
  {
    name: "특화 재료 IV",
    description: "난이도 +4, 활성 특화 풀 전용 재료 +50%.",
    icon: "special-risk",
    effects: [{ kind: "difficulty_reward", difficulty: 4, reward: "special", amount: 50 }],
  },
];

let smallIndex = 0;
let mediumIndex = 0;

function addSmall(
  id: string,
  x: number,
  y: number,
  angle: number,
  region: string,
): UnexploredNode {
  const seed = smallEffectSeeds[smallIndex++];
  if (!seed) throw new Error(`Missing small unexplored effect: ${id}`);
  return addNode({
    id,
    kind: "small",
    name: seed.name,
    description: seed.description,
    icon: seed.icon,
    x,
    y,
    angle,
    region,
    effects: [seed.effect],
  });
}

function addMedium(
  id: string,
  x: number,
  y: number,
  angle: number,
  region: string,
): UnexploredNode {
  const seed = mediumSeeds[mediumIndex++];
  if (!seed) throw new Error(`Missing medium unexplored effect: ${id}`);
  return addNode({
    id,
    kind: "medium",
    name: seed.name,
    description: seed.description,
    icon: seed.icon,
    x,
    y,
    angle,
    region,
    effects: seed.effects,
  });
}

addNode({
  id: "start",
  kind: "start",
  name: "탐사 시작",
  description: "미개척지를 개방하고 공용 탐사망을 시작합니다.",
  icon: "compass",
  x: CENTER.x,
  y: CENTER.y,
  region: "중앙",
  effects: [{ kind: "start" }],
});

const innerCounts = [4, 4, 4, 6, 6, 6, 6] as const;
const innerRadii = [75, 130, 185, 240, 295, 350, 405] as const;
const innerLayers: UnexploredNode[][] = [];

innerCounts.forEach((count, layerIndex) => {
  const layer: UnexploredNode[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle =
      -90 + index * (360 / count) + (layerIndex % 2 ? 180 / count : 0);
    const position = polar(innerRadii[layerIndex], angle);
    const node = addSmall(
      `inner-${layerIndex}-${index}`,
      position.x,
      position.y,
      angle,
      "초입 공용",
    );
    layer.push(node);
    if (layerIndex === 0) addEdge("start", node.id);
    else {
      for (const previous of nearestNodeIds(innerLayers[layerIndex - 1], angle)) {
        addEdge(previous, node.id);
      }
    }
  }
  for (let index = 0; index < count; index += 1) {
    addEdge(layer[index].id, layer[(index + 1) % count].id);
  }
  innerLayers.push(layer);
});

const coreIds: string[] = [];
const routeBIds: string[] = [];
const sharedIds: string[] = [];

UNEXPLORED_MONSTER_POOLS.forEach((pool, index) => {
  const angle = -90 + index * 30;
  const corePosition = polar(490, angle);
  const coreId = `pool-${pool.id}`;
  addNode({
    id: coreId,
    kind: "pool",
    name: pool.name,
    description: `${pool.name} 요청 출현 비중을 20%p 추가합니다. ${pool.focusDescription}.`,
    icon: "pool",
    x: corePosition.x,
    y: corePosition.y,
    angle,
    region: "특화 핵심",
    effects: [{ kind: "pool_core", poolId: pool.id, requestSharePct: 20 }],
    poolId: pool.id,
  });
  coreIds.push(coreId);
  for (const previous of nearestNodeIds(innerLayers[innerLayers.length - 1], angle)) {
    addEdge(previous, coreId);
  }

  const routeAPosition = polar(545, angle);
  const routeA = addSmall(
    `route-a-${index}`,
    routeAPosition.x,
    routeAPosition.y,
    angle,
    "특화 접근",
  );
  const routeBPosition = polar(590, angle);
  const routeB = addSmall(
    `route-b-${index}`,
    routeBPosition.x,
    routeBPosition.y,
    angle,
    "특화 접근",
  );
  routeBIds.push(routeB.id);
  addEdge(coreId, routeA.id);
  addEdge(routeA.id, routeB.id);
});

coreIds.forEach((id, index) => addEdge(id, coreIds[(index + 1) % 12]));

UNEXPLORED_MONSTER_POOLS.forEach((_pool, index) => {
  const angle = -75 + index * 30;
  const position = polar(635, angle);
  const shared = addSmall(
    `shared-${index}`,
    position.x,
    position.y,
    angle,
    "둘레 연결",
  );
  sharedIds.push(shared.id);
  addEdge(routeBIds[index], shared.id);
  addEdge(routeBIds[(index + 1) % 12], shared.id);
});

const sectorMediumIds: string[] = [];
UNEXPLORED_MONSTER_POOLS.forEach((pool, index) => {
  const baseAngle = -90 + index * 30;
  const leftAngle = baseAngle - 7;
  const rightAngle = baseAngle + 7;
  const leftInner = polar(690, leftAngle);
  const leftOuter = polar(745, leftAngle);
  const rightInner = polar(690, rightAngle);
  const rightOuter = polar(745, rightAngle);
  const isFront = FRONT_UNEXPLORED_POOL_IDS.includes(
    pool.id as FrontUnexploredPoolId,
  );
  const thirdId = isFront
    ? `enh-${pool.id}-loot`
    : `enh-${pool.id}-trace`;
  const thirdEffect: UnexploredNodeEffect = isFront
    ? { kind: "pool_loot", poolId: pool.id as FrontUnexploredPoolId, pct: 20 }
    : {
        kind: "pool_trace",
        poolId: pool.id as BossUnexploredPoolId,
        extraChancePct: 20,
      };
  const enhancers: Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    position: { x: number; y: number };
    angle: number;
    entry: string | null;
    effect: UnexploredNodeEffect;
  }> = [
    {
      id: `enh-${pool.id}-frequency`,
      name: `${pool.name} · 출현 강화`,
      description: "해당 풀 요청 출현 비중을 10%p 추가합니다.",
      icon: "frequency",
      position: leftInner,
      angle: leftAngle,
      entry: sharedIds[(index + 11) % 12],
      effect: { kind: "pool_frequency", poolId: pool.id, requestSharePct: 10 },
    },
    {
      id: `enh-${pool.id}-material`,
      name: `${pool.name} · 재료 탐색`,
      description: "해당 풀 전용 재료 기대 획득량이 20% 증가합니다.",
      icon: "material",
      position: leftOuter,
      angle: leftAngle,
      entry: null,
      effect: { kind: "pool_material", poolId: pool.id, pct: 20 },
    },
    {
      id: thirdId,
      name: `${pool.name} · ${isFront ? "전리품 탐색" : "흔적 추적"}`,
      description: isFront
        ? "해당 풀 몬스터의 일반 장비·골드 기대량이 20% 증가합니다."
        : "해당 풀 흔적의 추가 획득 확률이 20%p 증가합니다.",
      icon: isFront ? "loot" : "trace",
      position: rightInner,
      angle: rightAngle,
      entry: sharedIds[index],
      effect: thirdEffect,
    },
    {
      id: `enh-${pool.id}-focus`,
      name: `${pool.name} · 집중 강화`,
      description: `${pool.focusDescription}. 전용 재료 기본 확률이 1.5%로 증가합니다.`,
      icon: "focus",
      position: rightOuter,
      angle: rightAngle,
      entry: null,
      effect: { kind: "pool_focus", poolId: pool.id },
    },
  ];

  const enhancerIds = enhancers.map((seed) => {
    addNode({
      id: seed.id,
      kind: "enhancer",
      name: seed.name,
      description: seed.description,
      icon: seed.icon,
      x: seed.position.x,
      y: seed.position.y,
      angle: seed.angle,
      region: "풀 강화",
      effects: [seed.effect],
      poolId: pool.id,
    });
    if (seed.entry) addEdge(seed.entry, seed.id);
    return seed.id;
  });
  addEdge(enhancerIds[0], enhancerIds[1]);
  addEdge(enhancerIds[2], enhancerIds[3]);

  const mediumPosition = polar(805, baseAngle);
  const medium = addMedium(
    `sector-medium-${index}`,
    mediumPosition.x,
    mediumPosition.y,
    baseAngle,
    "중간 핵심",
  );
  sectorMediumIds.push(medium.id);
  addEdge(enhancerIds[1], medium.id);
  addEdge(enhancerIds[3], medium.id);
});

sectorMediumIds.forEach((id, index) =>
  addEdge(id, sectorMediumIds[(index + 1) % 12]),
);

const outerMediumIds: string[] = [];
for (let index = 0; index < 9; index += 1) {
  const angle = 105 + index * 35;
  const position = polar(850 + index * 3, angle);
  const medium = addMedium(
    `outer-medium-${index}`,
    position.x,
    position.y,
    angle,
    "심부 진입",
  );
  outerMediumIds.push(medium.id);
  if (index === 0) {
    for (const previous of nearestNodeIds(
      sectorMediumIds.map((id) => nodeById.get(id)!),
      angle,
      2,
    )) {
      addEdge(previous, medium.id);
    }
  } else addEdge(outerMediumIds[index - 1], medium.id);
}

const deepSeeds: ReadonlyArray<{
  id: string;
  name: string;
  description: string;
  icon: string;
  effect: UnexploredDeepEffect;
}> = [
  {
    id: "gold",
    name: "황금 탐사대",
    description: "골드 +30%, 장비·재료 획득량 -50%.",
    icon: "coin",
    effect: "gold",
  },
  {
    id: "collector",
    name: "수집가의 길",
    description: "일반·특화 재료 +80%, 골드·장비 -50%.",
    icon: "material",
    effect: "collector",
  },
  {
    id: "armory",
    name: "무구 발굴단",
    description: "장비 +80%, 골드·재료 -50%, 높은 품질 기대확률 +20%.",
    icon: "equipment",
    effect: "armory",
  },
  {
    id: "contract",
    name: "위험한 계약",
    description: "난이도 +5, 골드 +5%, 비골드 일반 사냥 보상 +15%.",
    icon: "contract",
    effect: "contract",
  },
  {
    id: "tracking",
    name: "집중 추적",
    description: "기본 풀 비중을 25%로 낮추고 특화 재료와 흔적을 강화합니다.",
    icon: "tracking",
    effect: "tracking",
  },
  {
    id: "boss",
    name: "우두머리의 흔적",
    description: "흔적 보관함과 개인 보스 소환석 제작을 개방합니다.",
    icon: "boss",
    effect: "boss",
  },
];

const deepLinks = [[2, 3], [3, 4], [4, 5], [5, 6], [7, 8]] as const;
deepSeeds.slice(0, 5).forEach((seed, index) => {
  const baseNode = nodeById.get(outerMediumIds[deepLinks[index][0]])!;
  const angle = baseNode.angle - 10;
  const position = polar(885, angle);
  const id = `deep-${seed.id}`;
  addNode({
    id,
    kind: "deep",
    name: seed.name,
    description: seed.description,
    icon: seed.icon,
    x: position.x,
    y: position.y,
    angle,
    region: "심부 핵심",
    effects: [{ kind: "deep", effect: seed.effect }],
  });
  addEdge(outerMediumIds[deepLinks[index][0]], id);
  addEdge(outerMediumIds[deepLinks[index][1]], id);
});

const bossBase = nodeById.get(outerMediumIds[8])!;
const bossAngle = bossBase.angle + 14;
const bossPosition = polar(870, bossAngle);
const bossSeed = deepSeeds[5];
addNode({
  id: "deep-boss",
  kind: "deep",
  name: bossSeed.name,
  description: bossSeed.description,
  icon: bossSeed.icon,
  x: bossPosition.x,
  y: bossPosition.y,
  angle: bossAngle,
  region: "최심부 핵심",
  effects: [{ kind: "deep", effect: "boss" }],
});
addEdge(outerMediumIds[8], "deep-boss");
addEdge("deep-tracking", "deep-boss");

if (nodes.length !== 160 || smallIndex !== 72 || mediumIndex !== 21) {
  throw new Error(
    `Invalid unexplored tree: nodes=${nodes.length}, small=${smallIndex}, medium=${mediumIndex}`,
  );
}

export const UNEXPLORED_NODES: readonly UnexploredNode[] = nodes;
export const UNEXPLORED_EDGES: readonly UnexploredEdge[] = edges;
export const UNEXPLORED_NODE_BY_ID: ReadonlyMap<string, UnexploredNode> = nodeById;

export function isUnexploredNodeId(value: unknown): value is UnexploredNodeId {
  return typeof value === "string" && nodeById.has(value);
}

export function shortestUnexploredPath(id: string): string[] {
  return shortestUnexploredPathFromActive([], id);
}

export function shortestUnexploredPathFromActive(
  activeNodeIds: readonly string[],
  id: string,
): string[] {
  if (!nodeById.has(id)) return [];
  const active = new Set(activeNodeIds.filter(isUnexploredNodeId));
  const queue = active.size > 0
    ? UNEXPLORED_NODES.filter((node) => active.has(node.id)).map(
        (node) => node.id,
      )
    : ["start"];
  const parent = new Map<string, string | null>(
    queue.map((nodeId) => [nodeId, null]),
  );
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current === id) break;
    for (const next of adjacency.get(current) ?? []) {
      if (parent.has(next)) continue;
      parent.set(next, current);
      queue.push(next);
    }
  }
  if (!parent.has(id)) return [];
  const path: string[] = [];
  let current: string | null = id;
  while (current !== null) {
    path.push(current);
    current = parent.get(current) ?? null;
  }
  return path.reverse();
}

export type UnexploredRewardPercentages = {
  gold: number;
  baseMaterial: number;
  equipment: number;
  quality: number;
  specialMaterial: number;
  rare: number;
};

export type UnexploredEffects = {
  difficulty: number;
  difficultyIncrease: number;
  encounterSelections: UnexploredPoolSelection[];
  baseMinShare: 25 | 30;
  rewardPct: UnexploredRewardPercentages;
  rareCopyChancePct: number;
  traceEnabled: boolean;
  traceExtraChancePct: number;
  traceExtraChancePctByPool: Partial<Record<UnexploredPoolId, number>>;
  focusedPoolIds: UnexploredPoolId[];
  poolMaterialPctByPool: Partial<Record<UnexploredPoolId, number>>;
  poolLootPctByPool: Partial<Record<UnexploredPoolId, number>>;
  basePoolRewardPct: number;
  conversion: null | "gold" | "collector" | "armory";
};

function addRecordValue<K extends string>(
  record: Partial<Record<K, number>>,
  key: K,
  amount: number,
): void {
  record[key] = (record[key] ?? 0) + amount;
}

export function deriveUnexploredEffects(
  nodeIds: readonly string[],
): UnexploredEffects {
  const selected = new Set(nodeIds.filter(isUnexploredNodeId));
  const rewardPct: UnexploredRewardPercentages = {
    gold: 0,
    baseMaterial: 0,
    equipment: 0,
    quality: 0,
    specialMaterial: 0,
    rare: 0,
  };
  const poolMaterialPctByPool: Partial<Record<UnexploredPoolId, number>> = {};
  const poolLootPctByPool: Partial<Record<UnexploredPoolId, number>> = {};
  const traceExtraChancePctByPool: Partial<Record<UnexploredPoolId, number>> = {};
  const focusedPoolIds: UnexploredPoolId[] = [];
  let difficultyIncrease = 0;
  let rareCopyChancePct = 0;
  let traceEnabled = false;
  let traceExtraChancePct = 0;
  let baseMinShare: 25 | 30 = 30;
  let basePoolRewardPct = 0;
  let conversion: UnexploredEffects["conversion"] = null;

  for (const id of selected) {
    const node = nodeById.get(id)!;
    for (const effect of node.effects) {
      switch (effect.kind) {
        case "start":
        case "pool_core":
        case "pool_frequency":
          break;
        case "reward": {
          const key = {
            gold: "gold",
            base_material: "baseMaterial",
            equipment: "equipment",
            quality: "quality",
            special_material: "specialMaterial",
          }[effect.reward] as keyof UnexploredRewardPercentages;
          rewardPct[key] += effect.pct;
          break;
        }
        case "difficulty_reward":
          difficultyIncrease += effect.difficulty;
          if (effect.reward === "gold") rewardPct.gold += effect.amount;
          else if (effect.reward === "base") {
            rewardPct.baseMaterial += effect.amount;
            rewardPct.equipment += effect.amount;
          } else if (effect.reward === "special") {
            rewardPct.specialMaterial += effect.amount;
          } else if (effect.reward === "trace") {
            traceExtraChancePct += effect.amount;
          } else rareCopyChancePct += effect.amount;
          break;
        case "pool_material":
          addRecordValue(poolMaterialPctByPool, effect.poolId, effect.pct);
          break;
        case "pool_loot":
          addRecordValue(poolLootPctByPool, effect.poolId, effect.pct);
          break;
        case "pool_trace":
          addRecordValue(
            traceExtraChancePctByPool,
            effect.poolId,
            effect.extraChancePct,
          );
          break;
        case "pool_focus":
          focusedPoolIds.push(effect.poolId);
          break;
        case "deep":
          if (effect.effect === "gold") {
            conversion = "gold";
            rewardPct.gold += 30;
            rewardPct.baseMaterial -= 50;
            rewardPct.equipment -= 50;
            rewardPct.specialMaterial -= 50;
            rewardPct.rare -= 50;
          } else if (effect.effect === "collector") {
            conversion = "collector";
            rewardPct.baseMaterial += 80;
            rewardPct.specialMaterial += 80;
            rewardPct.gold -= 50;
            rewardPct.equipment -= 50;
          } else if (effect.effect === "armory") {
            conversion = "armory";
            rewardPct.equipment += 80;
            rewardPct.quality += 20;
            rewardPct.gold -= 50;
            rewardPct.baseMaterial -= 50;
            rewardPct.specialMaterial -= 50;
            rewardPct.rare -= 50;
          } else if (effect.effect === "contract") {
            difficultyIncrease += 5;
            rewardPct.gold += 5;
            rewardPct.baseMaterial += 15;
            rewardPct.equipment += 15;
            rewardPct.specialMaterial += 15;
            rewardPct.rare += 15;
          } else if (effect.effect === "tracking") {
            baseMinShare = 25;
            basePoolRewardPct -= 25;
            rewardPct.specialMaterial += 30;
            traceExtraChancePct += 10;
          } else traceEnabled = true;
          break;
      }
    }
  }

  const encounterSelections = UNEXPLORED_MONSTER_POOLS.flatMap((pool) => {
    const core = selected.has(`pool-${pool.id}`);
    return core
      ? [{
          poolId: pool.id,
          core: true,
          frequency: selected.has(`enh-${pool.id}-frequency`),
        }]
      : [];
  });

  for (const key of Object.keys(rewardPct) as Array<keyof typeof rewardPct>) {
    rewardPct[key] = Math.max(-100, rewardPct[key]);
  }

  return {
    difficulty: Math.min(120, 95 + difficultyIncrease),
    difficultyIncrease,
    encounterSelections,
    baseMinShare,
    rewardPct,
    rareCopyChancePct: Math.min(100, Math.max(0, rareCopyChancePct)),
    traceEnabled,
    traceExtraChancePct: Math.min(95, Math.max(0, traceExtraChancePct)),
    traceExtraChancePctByPool,
    focusedPoolIds,
    poolMaterialPctByPool,
    poolLootPctByPool,
    basePoolRewardPct,
    conversion,
  };
}

export type UnexploredActivationError =
  | "unknown_node"
  | "already_active"
  | "point_limit"
  | "not_adjacent"
  | "conversion_conflict"
  | "difficulty_cap";

const CONVERSION_IDS = new Set(["deep-gold", "deep-collector", "deep-armory"]);

export function unexploredActivationError(
  selectedNodeIds: readonly string[],
  nodeId: string,
  earnedPoints: number,
): UnexploredActivationError | null {
  if (!isUnexploredNodeId(nodeId)) return "unknown_node";
  const selected = new Set(selectedNodeIds.filter(isUnexploredNodeId));
  if (selected.has(nodeId)) return "already_active";
  if (selected.size >= Math.max(0, Math.floor(earnedPoints))) return "point_limit";
  if (nodeId !== "start") {
    if (selected.size === 0) return "not_adjacent";
    const hasActiveNeighbour = [...(adjacency.get(nodeId) ?? [])].some((id) =>
      selected.has(id),
    );
    if (!hasActiveNeighbour) return "not_adjacent";
  } else if (selected.size > 0) return "not_adjacent";

  if (
    CONVERSION_IDS.has(nodeId) &&
    [...CONVERSION_IDS].some((id) => id !== nodeId && selected.has(id))
  ) {
    return "conversion_conflict";
  }
  if (deriveUnexploredEffects([...selected, nodeId]).difficultyIncrease > 25) {
    return "difficulty_cap";
  }
  return null;
}

export function unexploredActivationPath(
  selectedNodeIds: readonly string[],
  targetNodeId: string,
  earnedPoints: number,
):
  | { ok: true; nodeIds: string[] }
  | { ok: false; error: UnexploredActivationError } {
  if (!isUnexploredNodeId(targetNodeId)) {
    return { ok: false, error: "unknown_node" };
  }
  const selected = [
    ...new Set(selectedNodeIds.filter(isUnexploredNodeId)),
  ];
  const selectedSet = new Set(selected);
  if (selectedSet.has(targetNodeId)) {
    return { ok: false, error: "already_active" };
  }

  const nodeIds: string[] = [];
  for (const nodeId of shortestUnexploredPathFromActive(
    selected,
    targetNodeId,
  )) {
    if (selectedSet.has(nodeId)) continue;
    const error = unexploredActivationError(selected, nodeId, earnedPoints);
    if (error) return { ok: false, error };
    selected.push(nodeId);
    selectedSet.add(nodeId);
    nodeIds.push(nodeId);
  }
  return { ok: true, nodeIds };
}

export type UnexploredRefundError =
  | "unknown_node"
  | "not_active"
  | "start_required"
  | "would_disconnect";

export function unexploredRefundError(
  selectedNodeIds: readonly string[],
  nodeId: string,
): UnexploredRefundError | null {
  if (!isUnexploredNodeId(nodeId)) return "unknown_node";
  const selected = new Set(selectedNodeIds.filter(isUnexploredNodeId));
  if (!selected.has(nodeId)) return "not_active";
  if (nodeId === "start") return "start_required";
  selected.delete(nodeId);
  if (selected.size === 0) return null;
  if (!selected.has("start")) return "would_disconnect";

  const visited = new Set<string>(["start"]);
  const queue = ["start"];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const next of adjacency.get(queue[cursor]) ?? []) {
      if (!selected.has(next) || visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return visited.size === selected.size ? null : "would_disconnect";
}

export function unexploredRefundPath(
  selectedNodeIds: readonly string[],
  targetNodeId: string,
):
  | { ok: true; nodeIds: string[] }
  | { ok: false; error: UnexploredRefundError } {
  if (!isUnexploredNodeId(targetNodeId)) {
    return { ok: false, error: "unknown_node" };
  }
  const selected = [
    ...new Set(selectedNodeIds.filter(isUnexploredNodeId)),
  ];
  const remaining = new Set(selected);
  if (!remaining.has(targetNodeId)) {
    return { ok: false, error: "not_active" };
  }
  if (targetNodeId === "start") {
    return { ok: false, error: "start_required" };
  }
  remaining.delete(targetNodeId);

  const reachable = new Set<string>();
  const queue: string[] = [];
  if (remaining.has("start")) {
    reachable.add("start");
    queue.push("start");
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const next of adjacency.get(queue[cursor]) ?? []) {
      if (!remaining.has(next) || reachable.has(next)) continue;
      reachable.add(next);
      queue.push(next);
    }
  }

  const refundable = new Set(
    selected.filter((nodeId) => !reachable.has(nodeId)),
  );
  return {
    ok: true,
    nodeIds: selected.toReversed().filter((nodeId) => refundable.has(nodeId)),
  };
}

export function unexploredNodeName(id: string): string | null {
  return nodeById.get(id)?.name ?? null;
}

export function unexploredPoolName(poolId: UnexploredPoolId): string {
  return UNEXPLORED_POOL_BY_ID[poolId].name;
}
