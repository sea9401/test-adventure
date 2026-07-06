import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { pickFishId, rollFishSize } from "@/adventure/data/v2/fish";
import { multtaeAt } from "@/adventure/data/v2/multtae";
import { kstDailyKey } from "@/adventure/data/v2/v2RepeatQuests";
import {
  emptyV2SkillsState,
  equippedFishingBonuses,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import {
  FISHING_SESSION_KEY,
  expiresAtFor,
  rollBiteDelayMs,
  type FishingSession,
} from "@/adventure/v2/fishingSession";
import {
  FISHING_WALLET_KEY,
  fishingCatchCoinProgress,
} from "@/lib/server/fishing/coins";

// POST /api/v2/fishing/cast — 찌 던지기.
//
// 서버가 입질 지연과 "이번에 걸릴 물고기(종·사이즈)"를 무작위로 굴려 세션에 박제한다.
// 반응은 사이즈에 영향 없음(순수 운) — 클라엔 입질 지연만 알려 챔질 윈도우를 띄우게 한다.
// 어종·사이즈는 절대 응답에 싣지 않는다(클라 위조/예측 차단). reel 이 판정 후 공개.
export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const biteDelayMs = rollBiteDelayMs(Math.random);
  const biteAt = now + biteDelayMs;
  const skills = parseV2SkillsState(
    await readSave(db, userId, "skills.v2", emptyV2SkillsState()),
  );
  const fishingBonuses = equippedFishingBonuses(skills.equipped);
  // 현재 물때(결정론) — 그 시간대 한정 특별 손님을 추첨 풀에 합류시킨다. 사이즈/판정엔 영향 0.
  const mt = multtaeAt(now);
  const fishId = pickFishId(Math.random, mt.condition.id, {
    specialWeightBonusPct: fishingBonuses.specialWeightPct,
  });
  const size = rollFishSize(fishId, Math.random, {
    sizeBonusPct: fishingBonuses.sizeBonusPct,
    rareSizeBonusPct: fishingBonuses.rareSizeBonusPct,
    bigCatchSizeBonusPct: fishingBonuses.bigCatchSizeBonusPct,
  });
  const castId = randomUUID();

  const session: FishingSession = {
    castId,
    biteAt,
    expiresAt: expiresAtFor(biteAt),
    fishId,
    size,
  };

  await db.transaction(async (tx) => {
    // 직전 세션을 잠그고 덮어쓴다 — 새 캐스팅은 이전 캐스팅을 무효화(castId 불일치로 reel 거부).
    await lockSaveForUpdate(tx, userId, FISHING_SESSION_KEY, {});
    await upsertSave(tx, userId, FISHING_SESSION_KEY, session);
  });

  const dailyCatchCoins = fishingCatchCoinProgress(
    await readSave(db, userId, FISHING_WALLET_KEY, {}),
    kstDailyKey(new Date(now)),
  );

  return Response.json({ ok: true, castId, biteDelayMs, dailyCatchCoins });
}
