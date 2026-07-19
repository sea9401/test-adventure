import {
  FARM_CROPS,
  type FarmCropId,
} from "./farm";

export const WOODCUTTING_SEED_DROP_ROLL_SCALE = 1_000_000;

export type WoodcuttingSeedDropRate = {
  cropId: FarmCropId;
  grade: 1 | 2 | 3 | 4 | 5 | 6;
  chancePerMillion: number;
};

// 벌목은 무한 반복이 가능하므로, 성공 1회당 전체 씨앗 발견률을 0.49%로 제한한다.
// 작물 등급이 오를수록 절대 확률을 급격히 낮추며, 한 번에 씨앗은 최대 1개만 나온다.
export const WOODCUTTING_SEED_DROP_RATES: readonly WoodcuttingSeedDropRate[] = [
  { cropId: "wheat", grade: 1, chancePerMillion: 1_800 }, // 0.18%
  { cropId: "herb", grade: 1, chancePerMillion: 1_000 }, // 0.10%
  { cropId: "corn", grade: 2, chancePerMillion: 600 }, // 0.06%
  { cropId: "tomato", grade: 3, chancePerMillion: 400 }, // 0.04%
  { cropId: "strawberry", grade: 3, chancePerMillion: 300 }, // 0.03%
  { cropId: "potato", grade: 4, chancePerMillion: 250 }, // 0.025%
  { cropId: "onion", grade: 4, chancePerMillion: 200 }, // 0.02%
  { cropId: "rice", grade: 5, chancePerMillion: 150 }, // 0.015%
  { cropId: "soybean", grade: 5, chancePerMillion: 120 }, // 0.012%
  { cropId: "sugarcane", grade: 6, chancePerMillion: 60 }, // 0.006%
  { cropId: "cacao", grade: 6, chancePerMillion: 20 }, // 0.002%
];

export const WOODCUTTING_ANY_SEED_DROP_CHANCE_PER_MILLION =
  WOODCUTTING_SEED_DROP_RATES.reduce(
    (total, entry) => total + entry.chancePerMillion,
    0,
  );

export type WoodcuttingSeedDrop = {
  cropId: FarmCropId;
  seedName: string;
  quantity: 1;
};

export function rollWoodcuttingSeedDrop(
  rng: () => number = Math.random,
): WoodcuttingSeedDrop | null {
  const raw = Number(rng());
  if (!Number.isFinite(raw)) return null;
  const roll = Math.floor(
    Math.min(1, Math.max(0, raw)) * WOODCUTTING_SEED_DROP_ROLL_SCALE,
  );
  let threshold = 0;
  for (const entry of WOODCUTTING_SEED_DROP_RATES) {
    threshold += entry.chancePerMillion;
    if (roll < threshold) {
      return {
        cropId: entry.cropId,
        seedName: FARM_CROPS[entry.cropId].seedName,
        quantity: 1,
      };
    }
  }
  return null;
}
