import { db } from "@/db";
import { growthGuideStep } from "@/adventure/data/v2/growthGuide";
import { ensureUser } from "@/lib/server/ensureUser";
import { readSave } from "@/lib/server/savesKv";
import {
  GUIDE_QUESTS_KEY,
  buildQuestCtx,
  parseClaimed,
  type QuestExtras,
} from "@/lib/server/v2QuestContext";

// 성장의 길 단계는 캐릭터·숙련도·모험 기록만으로 판정한다. 다른 업적용 집계는 읽지 않는다.
const NO_EXTRAS: QuestExtras = {
  hasGuild: false,
  hasTraded: false,
  arenaPlayed: false,
  arenaWins: 0,
  referralCount: 0,
  guildDiningMeals: 0,
  guildTrainingDrills: 0,
  guildExpeditions: 0,
  guildWorkshopDeliveries: 0,
  guildAlchemyCrafts: 0,
  guildTradeContracts: 0,
  enchantGoldSpent: 0,
  fishSpecies: 0,
  fishCaught: 0,
  arenaTimes: [],
};

// GET /api/v2/me/quests/growth-step — 성장의 길에서 지금 할 단계 하나.
//   사냥 결과 아래의 "다음 할 일" 카드가 사냥할 때마다 부르므로, 전체 퀘스트 조회(/api/v2/me/quests)와 달리
//   세이브 네 개만 읽는다. 보상 수령은 기존 POST /api/v2/me/quests/claim 을 쓴다.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const [charRaw, proficiencyRaw, advLogRaw, guideRaw] = await Promise.all([
    readSave(db, userId, "character.v2", {}),
    readSave(db, userId, "proficiency.v2", {}),
    readSave(db, userId, "adventure-log.v2", {}),
    readSave(db, userId, GUIDE_QUESTS_KEY, {}),
  ]);
  const ctx = buildQuestCtx({
    charRaw,
    proficiencyRaw,
    advLogRaw,
    equipmentRaw: {},
    skillsRaw: {},
    craftingRaw: {},
    extras: NO_EXTRAS,
  });
  return Response.json({ ok: true, step: growthGuideStep(ctx, parseClaimed(guideRaw)) });
}
