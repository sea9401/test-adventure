export * from "./types";

import type { KillQuest, Quest } from "./types";
import type { RegionId } from "../world";
import { HOMELAND_QUESTS } from "./homeland";
import { DIOLA_QUESTS } from "./diola";
import { DUSTFORD_QUESTS } from "./dustford";
import { COAST_QUESTS } from "./coast";
import { UNHYANG_QUESTS } from "./unhyang";
import { SKYTHRONE_QUESTS } from "./skythrone";
import { STARLIT_QUESTS } from "./starlit";

export const QUESTS: Quest[] = [
  ...HOMELAND_QUESTS,
  ...DIOLA_QUESTS,
  ...DUSTFORD_QUESTS,
  ...COAST_QUESTS,
  ...UNHYANG_QUESTS,
  ...SKYTHRONE_QUESTS,
  ...STARLIT_QUESTS,
];

// 길드 게시판 노출용 — NPC 전속 퀘스트는 제외, kill 형만 노출.
// (deliver 형은 NPC 대화에서만 진행되므로 길드 게시판에 보이지 않는다.)
export function getQuestsForRegion(regionId: RegionId): KillQuest[] {
  return QUESTS.filter(
    (q): q is KillQuest =>
      q.target.kind === "kill" && q.regionId === regionId && !q.giverNpcId,
  );
}

export function getQuestById(id: string): Quest | undefined {
  return QUESTS.find((q) => q.id === id);
}
