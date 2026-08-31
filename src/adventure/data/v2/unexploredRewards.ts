import {
  UNEXPLORED_MONSTER_POOLS,
  UNEXPLORED_POOL_IDS,
  type UnexploredPoolId,
} from "./unexploredMonsterPools";
export {
  UNEXPLORED_BOSS_CORE_MATERIAL,
  UNEXPLORED_SUMMON_STONE_MATERIALS,
} from "./unexploredBosses";

export const UNEXPLORED_TRACE_CAP = 2_500;

export const UNEXPLORED_BASE_DROP_MATERIALS = {
  v2_unexplored_star_sea_shell: {
    id: "v2_unexplored_star_sea_shell",
    name: "성해 갑각",
    description: "성해의 파수꾼에게서 드물게 떨어지는 단단한 갑각.",
  },
  v2_unexplored_star_sea_core: {
    id: "v2_unexplored_star_sea_core",
    name: "성해의 핵",
    description: "성해의 파수꾼 내부에서 극히 드물게 발견되는 빛나는 핵.",
  },
  v2_unexplored_comet_feather: {
    id: "v2_unexplored_comet_feather",
    name: "혜성 깃털",
    description: "혜성꼬리 추적자의 몸에서 떨어져 나온 가벼운 깃털.",
  },
  v2_unexplored_faded_star_needle: {
    id: "v2_unexplored_faded_star_needle",
    name: "빛바랜 별침",
    description: "한때 별빛을 품었던 것으로 보이는 희귀한 침형 재료.",
  },
  v2_unexplored_red_stardust: {
    id: "v2_unexplored_red_stardust",
    name: "적색 성진",
    description: "적색거성의 사제 주위에 응축된 붉은 별가루.",
  },
  v2_unexplored_red_giant_ritual_tool: {
    id: "v2_unexplored_red_giant_ritual_tool",
    name: "적색거성의 제의구",
    description: "적색거성의 사제가 의식에 사용하던 극희귀 제의구.",
  },
  v2_unexplored_void_fang: {
    id: "v2_unexplored_void_fang",
    name: "공허 이빨",
    description: "공허를 먹는 짐승의 검고 단단한 이빨.",
  },
  v2_unexplored_compressed_void_sac: {
    id: "v2_unexplored_compressed_void_sac",
    name: "압축 공허낭",
    description: "불안정한 공허가 고밀도로 압축된 희귀한 기관.",
  },
  v2_unexplored_observation_lens: {
    id: "v2_unexplored_observation_lens",
    name: "관측 렌즈",
    description: "죽은 별의 관측자가 사용하던 정밀 렌즈.",
  },
  v2_unexplored_dead_star_eye: {
    id: "v2_unexplored_dead_star_eye",
    name: "죽은 별의 눈",
    description: "빛이 꺼진 별을 비추는 극희귀 관측 기관.",
  },
} as const;

export const UNEXPLORED_POOL_MATERIALS = Object.fromEntries(
  UNEXPLORED_MONSTER_POOLS.map((pool) => [
    pool.materialId,
    {
      id: pool.materialId,
      name: pool.materialName,
      description: `${pool.name} 개체에게서 얻는 미개척지 전용 재료.`,
    },
  ]),
) as Record<string, { id: string; name: string; description: string }>;

export type UnexploredTraceState = Partial<Record<UnexploredPoolId, number>>;

export function rollUnexploredTraceAmount(params: {
  defeatedSpecial: boolean;
  extraChancePct: number;
  rng: () => number;
}): 0 | 1 | 2 {
  if (!params.defeatedSpecial) return 0;
  const chance = Math.min(
    95,
    Math.max(0, Number(params.extraChancePct) || 0),
  );
  const roll = Math.min(
    1 - Number.EPSILON,
    Math.max(0, Number(params.rng()) || 0),
  );
  return roll * 100 < chance ? 2 : 1;
}

export function parseUnexploredTraces(raw: unknown): UnexploredTraceState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  return Object.fromEntries(
    UNEXPLORED_POOL_IDS.flatMap((poolId) => {
      const value = Math.floor(Number(source[poolId]));
      return Number.isFinite(value) && value > 0
        ? [[poolId, Math.min(UNEXPLORED_TRACE_CAP, value)]]
        : [];
    }),
  );
}

export function grantUnexploredTrace(
  raw: unknown,
  poolId: UnexploredPoolId,
  amount = 1,
): { traces: UnexploredTraceState; granted: number } {
  const traces = parseUnexploredTraces(raw);
  const before = traces[poolId] ?? 0;
  const requested = Math.max(0, Math.floor(Number(amount) || 0));
  const after = Math.min(UNEXPLORED_TRACE_CAP, before + requested);
  return {
    traces: after > 0 ? { ...traces, [poolId]: after } : traces,
    granted: after - before,
  };
}
