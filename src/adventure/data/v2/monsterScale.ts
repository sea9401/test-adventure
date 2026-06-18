import type { Monster } from "@/adventure/data/monsters/types";
import {
  floorStatMult,
  floorDefMult,
  floorExpMult,
  endgameSoften,
} from "./dungeonLadder";

// 던전 깊이(depth)의 사다리 배율로 Monster 의 hp/atk/def/exp 만 곱한다.
// skill/phaseTrigger/drops/태그 등은 그대로 — 동작 단순화 + 베이스 곡선 의존.
// 결과는 새 객체 — 호출자가 mutate 해도 베이스 MONSTERS 안 깨짐.
//
// 배율 출처 = dungeonLadder(§5.1): 들판(깊이 1~6) = ×1.0→×1.3 완만(온보딩 평탄), 7+ = 깊은 산
//   앵커 대비 hp/atk 선형 · def 댐핑(관통 0 절벽 회피) · exp 램프→소프트캡 후 우상향. depth 무한.
//   ⚠️ 계수 sim 캘리브 대상.
export function scaleMonsterForFloor(
  monster: Monster,
  depth: number,
  // 엔드게임 완화 적용 여부. 솔로 던전 사냥=true(기본). 협동 보스는 sharedMaxHp+anchorDepth 로
  //   난이도를 따로 튜닝하므로 false(앵커 깊이 24·42 가 완화 임계 위라 atk 가 의도치 않게 약화되는 것 방지).
  softenEndgame: boolean = true,
): Monster {
  // 엔드게임 완화 — hp+atk(sMult)에만 곱(def/exp/권장파워는 무관). floor 빌드 생존성 회복.
  const sMult =
    floorStatMult(depth) * (softenEndgame ? endgameSoften(depth) : 1);
  const dMult = floorDefMult(depth);
  const eMult = floorExpMult(depth);
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
