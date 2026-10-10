// 생활 전공 서버 헬퍼 — 활동 라우트가 성공 처리 끝에서 호출한다.
// 산물은 반환만 하고 캐릭터 세이브는 쓰지 않는다: 호출 라우트가 이미 잠근 character.v2 사본에
// 합쳐 저장해야 나중의 덮어쓰기로 산물이 사라지지 않는다.
// 잠금 순서: 활동 라우트의 기존 세이브 잠금들 뒤에 life-major.v1 을 잠근다.

import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import { COOKING_SAVE_KEY } from "@/adventure/v2/cooking/state";
import { FARM_SAVE_KEY } from "@/adventure/v2/farm";
import { FISHING_PROGRESS_KEY } from "@/adventure/v2/fishingProgression";
import { lifeSummaryFromSaves } from "@/adventure/v2/lifeSummary";
import { MINING_LOG_KEY } from "@/adventure/v2/miningSession";
import { WOODCUTTING_LOG_KEY } from "@/adventure/v2/woodcuttingSession";
import {
  addLifeMajorXp,
  LIFE_MAJOR_ACTIVITIES,
  LIFE_MAJOR_PRODUCT_ID,
  LIFE_MAJOR_PRODUCTS,
  LIFE_MAJOR_SAVE_KEY,
  lifeMajorProductChancePct,
  lifeMajorRole,
  parseLifeMajorState,
  type LifeMajorActivity,
  type LifeMajorState,
} from "@/adventure/v2/lifeMajor";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
  type DbExecutor,
} from "@/lib/server/savesKv";
import { insertNotificationWith } from "@/lib/server/v2Notifications";

export async function readLifeMajorState(
  executor: DbExecutor,
  userId: string,
): Promise<LifeMajorState> {
  return parseLifeMajorState(await readSave(executor, userId, LIFE_MAJOR_SAVE_KEY, {}));
}

export type LifeMajorProgressResult = {
  masteryXpGained: number;
  productId: string | null;
  productCount: number;
};

const NONE: LifeMajorProgressResult = { masteryXpGained: 0, productId: null, productCount: 0 };

export async function applyLifeMajorProgress(
  tx: DbExecutor,
  userId: string,
  activity: LifeMajorActivity,
  args: { overflowXp: number; successes: number; rng: () => number },
): Promise<LifeMajorProgressResult> {
  const state = parseLifeMajorState(await lockSaveForUpdate(tx, userId, LIFE_MAJOR_SAVE_KEY, {}));
  if (lifeMajorRole(state, activity) === null) return NONE;

  const chancePct = lifeMajorProductChancePct(state, activity);
  let productCount = 0;
  const rolls = Math.max(0, Math.floor(args.successes));
  if (chancePct > 0) {
    for (let index = 0; index < rolls; index += 1) {
      if (args.rng() * 100 < chancePct) productCount += 1;
    }
  }
  const added = addLifeMajorXp(state, activity, args.overflowXp);
  if (added.gained === 0 && productCount === 0) return NONE;

  const next: LifeMajorState =
    productCount > 0
      ? {
          ...added.state,
          masterProductsEarned: {
            ...added.state.masterProductsEarned,
            [activity]: (added.state.masterProductsEarned[activity] ?? 0) + productCount,
          },
        }
      : added.state;
  await upsertSave(tx, userId, LIFE_MAJOR_SAVE_KEY, next);
  if (productCount > 0 && activity !== "cooking") {
    // 결과 화면이 활동마다 달라 산물 획득은 알림으로 통일해 알린다(같은 트랜잭션).
    const product = LIFE_MAJOR_PRODUCTS[activity];
    await insertNotificationWith(tx, userId, "master_product", {
      activity,
      materialId: product.id,
      name: product.name,
      count: productCount,
    });
  }
  return {
    masteryXpGained: added.gained,
    productId:
      productCount > 0 && activity !== "cooking" ? LIFE_MAJOR_PRODUCT_ID[activity] : null,
    productCount,
  };
}

export type LifeMajorResponse = {
  masteryXpGained: number;
  masterProduct: { materialId: string; name: string; count: number } | null;
};

export function lifeMajorResponse(progress: LifeMajorProgressResult): LifeMajorResponse {
  const product =
    progress.productId && progress.productCount > 0
      ? Object.values(LIFE_MAJOR_PRODUCTS).find((entry) => entry.id === progress.productId)
      : undefined;
  return {
    masteryXpGained: progress.masteryXpGained,
    masterProduct: product
      ? { materialId: product.id, name: product.name, count: progress.productCount }
      : null,
  };
}

/** 라우트가 저장할 character.v2 재료 묶음에 명장 산물을 합친다. */
export function withMasterProduct(
  materials: unknown,
  progress: LifeMajorProgressResult,
): Record<string, number> {
  return progress.productId && progress.productCount > 0
    ? mergeDrops(materials, { [progress.productId]: progress.productCount })
    : mergeDrops(materials, {});
}

/** 생활별 현재 레벨(전공 자격 판정용). 생활 기록 요약과 같은 계산을 쓴다. */
export async function readLifeLevels(
  executor: DbExecutor,
  userId: string,
): Promise<Record<LifeMajorActivity, number>> {
  const [farmRaw, woodcuttingRaw, miningRaw, fishingRaw, cookingRaw] = await Promise.all([
    readSave(executor, userId, FARM_SAVE_KEY, {}),
    readSave(executor, userId, WOODCUTTING_LOG_KEY, {}),
    readSave(executor, userId, MINING_LOG_KEY, {}),
    readSave(executor, userId, FISHING_PROGRESS_KEY, {}),
    readSave(executor, userId, COOKING_SAVE_KEY, {}),
  ]);
  const summary = lifeSummaryFromSaves({ farmRaw, woodcuttingRaw, miningRaw, fishingRaw, cookingRaw });
  const levels = Object.fromEntries(LIFE_MAJOR_ACTIVITIES.map((id) => [id, 1])) as Record<
    LifeMajorActivity,
    number
  >;
  for (const activity of summary.activities) {
    if ((LIFE_MAJOR_ACTIVITIES as readonly string[]).includes(activity.id)) {
      levels[activity.id as LifeMajorActivity] = activity.level;
    }
  }
  return levels;
}
