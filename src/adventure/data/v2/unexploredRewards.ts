import {
  UNEXPLORED_MONSTER_POOLS,
  UNEXPLORED_POOL_IDS,
  type UnexploredPoolId,
} from "./unexploredMonsterPools";

export const UNEXPLORED_TRACE_CAP = 2_500;

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
    100,
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
