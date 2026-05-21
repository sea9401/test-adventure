import type { EquipBonus, EquipItem } from "@/adventure/data/items";
import type { CraftTier } from "@/adventure/data/craftQuality";
import type { DropQuality } from "@/adventure/data/dropQuality";
import type { StatKey } from "@/adventure/data/stats";
import type { Gender } from "@/adventure/profile/avatars";
import type { EnhanceMode } from "./enhancement";
import type { EnchantSlot } from "./enchant";

export type Skill = {
  name: string;
  description?: string;
};

// 슬롯에 들어가는 장비 — 제작산이면 등급(craftTier), 드랍산 고품질이면 dropQuality 가 박혀
// 있고 bonus·stats 는 그 등급 반영본. 둘 다 미지정/0 = 평범한 장비(기본 드랍/상점/퀘스트/시작).
// craftTier 와 dropQuality 는 상호 배타 — 한 인스턴스에 둘 다 박히지 않는다.
//
// instanceId 가 박힌 경우 = 인스턴스 기반 장비(별빛 무구). enhancementLevel(0~7) 의
// 강화 보너스가 bonus·stats 에 합쳐져 있다. 인벤토리로 회수할 때는 instanceId 로 다시
// equipmentInstances 풀에 돌려놓는다. enhanceHistory / remainingAttempts 는 풀로 회수
// 후 복원되도록 슬롯에 같이 박혀 있다.
export type EquippedItem = EquipItem & {
  craftTier?: CraftTier;
  dropQuality?: DropQuality;
  /** 인스턴스 기반 장비 한정. 강화 단계 (0~7). bonus/stats 에 이미 합쳐져 있다. */
  enhancementLevel?: number;
  /** 인스턴스 기반 장비 한정. 단계별 모드 history. 회수 시 풀에 복원하기 위해 들고 다닌다. */
  enhanceHistory?: EnhanceMode[];
  /** 인스턴스 기반 장비 한정. 자루별 남은 강화 시도 횟수. */
  remainingAttempts?: number;
  /** 인스턴스 기반 장비 한정. 슬롯에서 빠질 때 equipmentInstances 로 복원하는 키. */
  instanceId?: string;
  /** 인스턴스 기반 장비 한정. 부여된 마법부여 슬롯. 회수 시 풀에 복원하기 위해 들고 다닌다. */
  enchantSlots?: EnchantSlot[];
  /** 별빛 고리(롤 장신구) 한정. 드랍 시 롤된 옵션. 회수 시 풀에 복원하기 위해 들고 다닌다. */
  rolledBonus?: EquipBonus;
};

export type EquippedSlots = {
  weapon: EquippedItem | null;
  armor: EquippedItem | null;
  accessory: EquippedItem | null;
};

export type Character = {
  name: string;
  className: string;
  /** 장착 중인 칭호 이름 (TITLES[id].name). 미장착이면 undefined. */
  titleName?: string;
  gender: Gender;
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  exp: number;
  maxExp: number;
  gold: number;
  affiliation: string;
  battleCount: number;
  fame: number;
  skills: Skill[];
  stats: Record<StatKey, number>;
  equipped: EquippedSlots;
};
