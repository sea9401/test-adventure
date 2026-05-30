import type { Monster } from "@/adventure/data/monsters/types";
import type { DungeonFloorId } from "./types";
import { FLOOR_DIFFICULTY } from "./dungeon";

// 던전 floor 의 multiplier 로 라이브 Monster 의 hp/atk/def/exp 만 곱한다.
// skill/phaseTrigger/drops/태그 등은 그대로 — 동작 단순화 + 라이브 곡선 의존.
// 결과는 새 객체 — 호출자가 mutate 해도 라이브 MONSTERS 안 깨짐.

// floor 5(설원) v2 성장 정규화.
// floor 5(Lv70~100 성장 구간)는 라이브 5막 엔드게임 엘리트(옥좌의 검신·잠든 황좌 거인 등,
// def 60~82·hp 최대 2070·atk 최대 136)를 그대로 끌어 쓴다. 그러나 v2 캐릭은 방어 무시(룬·AP·
// 각인·파라곤)가 전부 제거돼 관통이 0이라, 몬스터 def 가 플레이어 atk(Lv100 STR 85)에 육박하면
// 데미지가 바닥나 절벽이 된다(전 빌드 0% 승률).
//   - FLOOR5_MULT: hp/atk/def/exp 를 일괄 축소 — 변동성(작은 몹 vs 거인) 보존하며 v2 범위로.
//   - FLOOR5_DEF_CAP: def 는 배율 후에도 절벽이라 추가 cap — 관통 0 인 v2 가 깰 수 있게.
// floor 1~4 는 이미 적정(불꽃 골렘 def26·hp680)이라 손대지 않고, floor 6~8 엔드 파밍은
// 의도적으로 어려워야 하므로 미적용(별빛 ×1.2~4.0 그대로).
// sim-v2-progression --skills 캘리브 후 다이얼링.
const FLOOR5_MULT = 0.4;
const FLOOR5_DEF_CAP = 26;

export function scaleMonsterForFloor(
  monster: Monster,
  floor: DungeonFloorId,
): Monster {
  const mult = FLOOR_DIFFICULTY[floor] * (floor === 5 ? FLOOR5_MULT : 1);
  const hp = Math.max(1, Math.round(monster.hp * mult));
  const atk = Math.max(1, Math.round(monster.atk * mult));
  // floor 5 는 배율 후 def 를 추가 cap (관통 0 인 v2 의 절벽 방지).
  const rawDef = Math.max(0, Math.round(monster.def * mult));
  const def = floor === 5 ? Math.min(rawDef, FLOOR5_DEF_CAP) : rawDef;
  const exp = Math.max(0, Math.round(monster.exp * mult));
  // 아무것도 안 바뀌면 원본 그대로 (floor 1~4 의 ×1.0).
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
