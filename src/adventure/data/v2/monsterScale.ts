import type { Monster } from "@/adventure/data/monsters/types";
import type { DungeonFloorId } from "./types";
import { FLOOR_DIFFICULTY } from "./dungeon";

// 던전 floor 의 multiplier 로 라이브 Monster 의 hp/atk/def/exp 만 곱한다.
// skill/phaseTrigger/drops/태그 등은 그대로 — 동작 단순화 + 라이브 곡선 의존.
// 결과는 새 객체 — 호출자가 mutate 해도 라이브 MONSTERS 안 깨짐.

export function scaleMonsterForFloor(
  monster: Monster,
  floor: DungeonFloorId,
): Monster {
  const mult = FLOOR_DIFFICULTY[floor];
  if (mult === 1) return monster;
  return {
    ...monster,
    hp: Math.max(1, Math.round(monster.hp * mult)),
    atk: Math.max(1, Math.round(monster.atk * mult)),
    def: Math.max(0, Math.round(monster.def * mult)),
    exp: Math.max(0, Math.round(monster.exp * mult)),
  };
}
