import type { ItemId } from "../items";
import type { MaterialId } from "../materials";
import type { NpcId } from "../npcs";
import type { PotionId } from "../potions";
import type { RegionId } from "../world";
import type { SkillBookId } from "../skillBooks";

export type QuestRewardItem = { id: ItemId; count: number };
export type QuestRewardPotion = { id: PotionId; count: number };
export type QuestRewardMaterial = { id: MaterialId; count: number };

export type QuestReward = {
  gold?: number;
  fame?: number;
  exp?: number;
  potions?: QuestRewardPotion[];
  materials?: QuestRewardMaterial[];
  items?: QuestRewardItem[];
  recipes?: string[];
  // 종류별 포션 최대 보유 수의 영구 보너스(+n).
  potionCapacityBonus?: number;
  // 학습 전 AP 스킬북, 보상 회수 시 인벤토리에 1권씩 들어간다.
  skillBooks?: SkillBookId[];
};

// 의뢰 목표, 8 종류:
// - "kill"             : 지정 몬스터를 N마리 처치. 진행도는 storage 의 progress 에 누적.
// - "deliver"          : 지정 재료를 N개 모아 의뢰주(NPC)에게 직접 건넨다. 진행도는 별도
//                        저장하지 않고, NPC 대화에서 인벤토리 잔량을 보고 즉시 판정·소비한다.
// - "talk_to_npc"      : 지정 NPC 와 N번 대화. 대화창 닫힐 때(TownSubView.onTalkClose) 누적.
// - "visit_region"     : 지정 지역에 N번 입장. 지역 이동 성공 시(page.tsx region 효과) 누적.
// - "craft_item"       : 지정 장비를 N개 제작. 제작 성공 시(useCraftAction) 누적.
// - "equip_item"       : 지정 장비를 한 번이라도 장착. 장착 슬롯 변경 감지(page.tsx checkEquip) 시
//                        조건 충족 시점에 즉시 ready 로 전환. progress 는 0 또는 1.
// - "equip_set"        : 지정 장비 N종을 동시에 장착. progress = 현재 동시 장착 중인 수.
// - "kill_within_hp"   : 지정 몬스터를 처치 시점 HP 가 maxHp×minHpFraction 이상으로 N번 처치.
//                        조건 미달 처치는 진행도 증가 없음 (보스 도전 의뢰, 엄격한 처치).
// - "no_potion_boss"   : 지정 몬스터를 그 전투에서 포션 0병 사용으로 N번 처치.
export type QuestTarget =
  | { kind: "kill"; monsterName: string; count: number }
  | { kind: "deliver"; materialId: MaterialId; count: number }
  | { kind: "talk_to_npc"; npcId: NpcId; count?: number }
  | { kind: "visit_region"; regionId: RegionId; count?: number }
  | { kind: "craft_item"; itemId: ItemId; count: number }
  | { kind: "equip_item"; itemId: ItemId }
  | { kind: "equip_set"; itemIds: ItemId[] }
  | { kind: "kill_within_hp"; monsterName: string; minHpFraction: number; count: number }
  | { kind: "no_potion_boss"; monsterName: string; count: number };

// 의뢰 목표가 요구하는 총량, UI 와 useQuests 가 공용으로 쓴다.
// count 가 없는 kind 는 1 (talk/visit 기본), equip_item 도 1, equip_set 은 itemIds.length.
export function questTargetTotal(t: QuestTarget): number {
  switch (t.kind) {
    case "kill":
    case "deliver":
    case "craft_item":
    case "kill_within_hp":
    case "no_potion_boss":
      return t.count;
    case "talk_to_npc":
    case "visit_region":
      return t.count ?? 1;
    case "equip_item":
      return 1;
    case "equip_set":
      return t.itemIds.length;
  }
}

// 행정 패널/덤프용 짧은 요약 문자열. (UI 의 사용자용 설명은 QuestJournalView 의 TargetView 가 그린다.)
export function questTargetSummary(t: QuestTarget): string {
  switch (t.kind) {
    case "kill":
      return `${t.monsterName} ×${t.count}`;
    case "kill_within_hp":
      return `${t.monsterName} ×${t.count} (HP ${Math.round(t.minHpFraction * 100)}%↑)`;
    case "no_potion_boss":
      return `${t.monsterName} ×${t.count} (포션 X)`;
    case "deliver":
      return `${t.materialId} ×${t.count}`;
    case "talk_to_npc":
      return `${t.npcId} 대화 ×${t.count ?? 1}`;
    case "visit_region":
      return `${t.regionId} 방문 ×${t.count ?? 1}`;
    case "craft_item":
      return `${t.itemId} 제작 ×${t.count}`;
    case "equip_item":
      return `${t.itemId} 장착`;
    case "equip_set":
      return `한 복 장착 (${t.itemIds.length}종)`;
  }
}

export type Quest = {
  id: string;
  regionId: RegionId;
  title: string;
  description: string;
  requiredLevel: number;
  target: QuestTarget;
  reward: QuestReward;
  repeatable: boolean;
  // 반복 의뢰의 재수주 쿨다운(ms). 미지정 시 REPEAT_COOLDOWN_MS_DEFAULT.
  // repeatable=false 인 경우 의미 없음.
  cooldownMs?: number;
  // 설정 시 길드 게시판에 노출되지 않고 해당 NPC 대화에서만 진행.
  giverNpcId?: NpcId;
  // 설정 시 지정된 의뢰가 'completed' 상태일 때만 게시판/UI 에 노출.
  // 메인 라인을 끝낸 모험가에게만 풀리는 후속 반복 의뢰 등에 사용.
  requiresQuestCompleted?: string;
  // 발견형 의뢰, 인벤/플래그/특수 조건이 다이얼로그에서 게이트하는 케이스.
  // 데이터로 게이트를 표현할 수 없어 NPC 뱃지("!") 가 스포일하지 않도록 통째로 제외.
  // 플레이어가 직접 NPC 와 대화해 발견해야 함.
  hidden?: boolean;
};

export const REPEAT_COOLDOWN_MS_DEFAULT = 6 * 60 * 60 * 1000;

const H = 60 * 60 * 1000;
// 지역별 반복 의뢰 기본 쿨다운. 우선순위: quest.cooldownMs > 이 맵 > REPEAT_COOLDOWN_MS_DEFAULT.
// 초반 마을은 짧게(빌드/명성/골드 빨리), 후반 지역은 길게(반복 효율 억제).
export const REGION_REPEAT_COOLDOWN_MS: Partial<Record<RegionId, number>> = {
  village: 3 * H,
  dustford: 4 * H,
  diola: 6 * H,
  saltmarsh: 7 * H,
  unhyang: 8 * H,
  windvale: 10 * H,
  skyreach: 12 * H,
};

export type KillQuest = Quest & { target: { kind: "kill"; monsterName: string; count: number } };

