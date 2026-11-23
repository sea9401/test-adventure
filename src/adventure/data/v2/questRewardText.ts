import { TITLES } from "@/adventure/data/titles";
import { V2_EQUIPMENT } from "./v2Equipment";
import type { QuestReward } from "./v2Quests";

/** 퀘스트 보상을 한 줄로. 보상이 없으면 빈 문자열. */
export function questRewardText(reward: QuestReward): string {
  const parts: string[] = [];
  if (reward.gold) parts.push(`${reward.gold.toLocaleString()} 골드(은행 입금)`);
  if (reward.equip) {
    parts.push(V2_EQUIPMENT[reward.equip]?.name ?? reward.equip);
  }
  if (reward.staminaPotions) {
    parts.push(`스태미나 회복약 ${reward.staminaPotions}개`);
  }
  if (reward.boundStaminaPotions) {
    parts.push(`귀속 스태미나 회복약 ${reward.boundStaminaPotions}개`);
  }
  if (reward.masteryCertificates) {
    parts.push(`숙련 증서 ${reward.masteryCertificates.toLocaleString("ko-KR")}개`);
  }
  if (reward.titleId) {
    parts.push(`칭호: ${TITLES[reward.titleId]?.name ?? reward.titleId}`);
  }
  return parts.join(" · ");
}
