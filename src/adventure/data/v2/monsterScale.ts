import type { Monster } from "@/adventure/data/monsters/types";
import type { DungeonFloorId } from "./types";
import { floorStatMult, floorDefMult, floorExpMult } from "./dungeonLadder";

// 던전 floor 의 사다리 배율로 Monster 의 hp/atk/def/exp 만 곱한다.
// skill/phaseTrigger/drops/태그 등은 그대로 — 동작 단순화 + 베이스 곡선 의존.
// 결과는 새 객체 — 호출자가 mutate 해도 베이스 MONSTERS 안 깨짐.
//
// 배율 출처 = dungeonLadder(§5.1): floor 1·2 = ×1.0(authored 몹 그대로), 3+ = 깊은 산
//   앵커 대비 hp/atk 선형 · def 댐핑(관통 0 절벽 회피) · exp 램프→플래토. ⚠️ 계수 sim 캘리브 대상.
export function scaleMonsterForFloor(
  monster: Monster,
  floor: DungeonFloorId,
): Monster {
  const sMult = floorStatMult(floor);
  const dMult = floorDefMult(floor);
  const eMult = floorExpMult(floor);
  const hp = Math.max(1, Math.round(monster.hp * sMult));
  const atk = Math.max(1, Math.round(monster.atk * sMult));
  const def = Math.max(0, Math.round(monster.def * dMult));
  const exp = Math.max(0, Math.round(monster.exp * eMult));
  // 아무것도 안 바뀌면 원본 그대로 (floor 1·2 의 ×1.0).
  if (
    hp === monster.hp &&
    atk === monster.atk &&
    def === monster.def &&
    exp === monster.exp
  ) {
    return monster;
  }
  return { ...monster, hp, atk, def, exp };
}
