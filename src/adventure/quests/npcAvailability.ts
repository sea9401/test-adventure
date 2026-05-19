import type { NpcId } from "../data/npcs";
import { QUESTS } from "../data/quests";
import { cooldownStatus } from "./cooldown";
import type { QuestProgressEntry } from "./storage";

type Opts = {
  /** adventureLog.log.titles — 일부 의뢰가 칭호 보유 시 영구 차단된다(예: unfilial → 첫 모험가의 의장). */
  titles?: Record<string, unknown>;
};

// 영구 차단 조건이 걸린 의뢰 — 만족 시 뱃지에서 빼고, 다이얼로그도 거절로 흐른다.
// 추가 사례 생기면 여기에 한 줄씩.
function isPermanentlyBlocked(questId: string, opts: Opts): boolean {
  // mom_amulet 을 팔아 unfilial 칭호가 박힌 캐릭은 부적 재취득 경로가 없어 equip_set 영영 불가.
  if (questId === "diola-marin-first-gear-set" && opts.titles?.unfilial) {
    return true;
  }
  return false;
}

// TownView 의 NPC "!" 뱃지 판정 — 지금 이 NPC 와 대화하면 새 의뢰를 받을 수 있는가.
// 조건: giverNpcId 일치 + state=available + 레벨 충족 + 쿨다운 OK + 선행 의뢰(completedCount>0) + 영구 차단 아님.
// 한계: 일부 NPC 다이얼로그가 추가로 스토리 플래그를 검사 (예: 마린의 ruinsGuided).
// 거짓 양성이 보고되면 그때 플래그 게이트를 인지하도록 확장. 거짓 음성은 없음.
export function npcHasAcceptableQuest(
  npcId: NpcId,
  characterLevel: number,
  getEntry: (id: string) => QuestProgressEntry,
  now: number,
  opts: Opts = {},
): boolean {
  return QUESTS.some((q) => {
    if (q.giverNpcId !== npcId) return false;
    // 발견형 의뢰는 뱃지로 스포일하지 않음 — 다이얼로그가 인벤/플래그/특수 조건을 직접 판정.
    if (q.hidden) return false;
    const entry = getEntry(q.id);
    if (entry.state !== "available") return false;
    if (characterLevel < q.requiredLevel) return false;
    if (cooldownStatus(q, entry, now).onCooldown) return false;
    if (q.requiresQuestCompleted) {
      if (getEntry(q.requiresQuestCompleted).completedCount === 0) return false;
    }
    if (isPermanentlyBlocked(q.id, opts)) return false;
    return true;
  });
}

export type NpcQuestBadge = "ready" | "available" | null;

// 우선순위 기반 뱃지 판정:
//   "ready"     — 이 NPC 와 연결된 의뢰 중 ready(목표 완료, 보상 미수령) 가 1개 이상
//   "available" — ready/active 가 없고, npcHasAcceptableQuest 조건 만족하는 의뢰 존재
//   null        — 그 외 (수락 후 진행 중이거나, 받을 게 없음)
// 의도: 한 NPC 가 병렬로 여러 의뢰를 줄 때, 하나 수락한 뒤에는 "!" 를 끄고 진행에 집중하게.
// 보상 받을 게 생기면 "?" 로 알려주고, 마무리되면 다시 "!" 로 다음 의뢰 신호.
export function npcQuestBadge(
  npcId: NpcId,
  characterLevel: number,
  getEntry: (id: string) => QuestProgressEntry,
  now: number,
  opts: Opts = {},
): NpcQuestBadge {
  let hasInProgress = false;
  for (const q of QUESTS) {
    if (q.giverNpcId !== npcId) continue;
    if (q.hidden) continue;
    const entry = getEntry(q.id);
    if (entry.state === "ready") return "ready";
    if (entry.state === "active") hasInProgress = true;
  }
  if (hasInProgress) return null;
  return npcHasAcceptableQuest(npcId, characterLevel, getEntry, now, opts)
    ? "available"
    : null;
}
