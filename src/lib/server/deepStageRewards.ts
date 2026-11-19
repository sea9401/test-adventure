import {
  deepStageTitleIds,
  deepStageTokenReward,
  recordDeepStageClear,
  type DeepDungeonId,
  type DeepProgress,
} from "@/adventure/data/v2/dungeonDeepStage";
import { DEEP_SHOP_SAVE_KEY, addDeepTokens, parseDeepShopState } from "@/adventure/v2/deepShop";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import { lockSaveForUpdate, upsertSave, type DbExecutor } from "@/lib/server/savesKv";

/**
 * 심층 단계 실전 완주 보상. 증표를 교환소 세이브에 더하고, 최고 단계가 올랐으면 새로 채운 칭호를
 * 준다. 심층이 아니면(stage 0) 아무것도 하지 않는다. 호출하는 던전 라우트는 character.v2 와 던전
 * 세이브를 먼저 잠근 상태여야 한다(잠금 순서: character.v2 → 던전 세이브 → deep-shop.v1 → adventure-log.v2).
 */
export async function grantDeepStageClear(
  tx: DbExecutor,
  userId: string,
  dungeon: DeepDungeonId,
  progress: DeepProgress,
  stage: number,
  now: number = Date.now(),
): Promise<{ progress: DeepProgress; tokens: number }> {
  const tokens = deepStageTokenReward(stage);
  if (tokens <= 0) return { progress, tokens: 0 };
  const shop = parseDeepShopState(
    await lockSaveForUpdate<unknown>(tx, userId, DEEP_SHOP_SAVE_KEY, {}),
    new Date(now),
  );
  await upsertSave(tx, userId, DEEP_SHOP_SAVE_KEY, addDeepTokens(shop, tokens));
  const next = recordDeepStageClear(progress, stage, now);
  const earnedBefore = new Set(deepStageTitleIds(dungeon, progress.deepBest));
  for (const titleId of deepStageTitleIds(dungeon, next.deepBest)) {
    if (!earnedBefore.has(titleId)) await grantTitleIfMissingInTx(tx, userId, titleId, now);
  }
  return { progress: next, tokens };
}
