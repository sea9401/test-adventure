import { ITEMS } from "@/adventure/data/items";
import type { StatKey } from "@/adventure/data/stats";
import type { EquippedItem, Skill } from "./types";

// 레벨 1 기준 베이스 — 레벨 N의 maxHp 는 baseCharacter.maxHp + (N-1) * HP_PER_LEVEL.
export const HP_PER_LEVEL = 5;

// 직업 미정 시 표시되는 기본 className. 채팅 헤더 등에서 "의미 없는" 표시이므로
// 이 값과 같으면 UI 에서 숨길 수 있도록 export.
export const DEFAULT_CLASS_NAME = "무직";

export const baseCharacter = {
  className: DEFAULT_CLASS_NAME,
  level: 1,
  hp: 97,
  maxHp: 97,
  exp: 0,
  maxExp: 120,
  gold: 0,
  affiliation: "무소속",
  battleCount: 0,
  fame: 0,
  skills: [] as Skill[],
  stats: { str: 3, dex: 3, vit: 3, spd: 3, luk: 3 } as Record<StatKey, number>,
  equipped: {
    weapon: ITEMS.branch_stick as EquippedItem | null,
    armor: ITEMS.cloth_clothes as EquippedItem | null,
    accessory: ITEMS.mom_amulet as EquippedItem | null,
  },
};

export function maxHpForLevel(level: number): number {
  return baseCharacter.maxHp + Math.max(0, level - 1) * HP_PER_LEVEL;
}
