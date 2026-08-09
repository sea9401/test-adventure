import type { Monster } from "@/adventure/data/monsters/types";
import {
  floorStatMult,
  floorDefMult,
  floorExpMult,
  endgameSoften,
  endExtensionCombatSoften,
  frontierOnsetSoften,
  floorCritHpComp,
  floorAccuracy,
  fixedFrontierAccuracyMult,
  fixedFrontierAttackMult,
  fixedFrontierDefenseMult,
  fixedFrontierDurabilityMult,
  fixedFrontierEvasionBonus,
  lateAccuracyMult,
  lateAttackMult,
  lateDefenseMult,
  lateDurabilityMult,
  lateEvasionBonus,
  lateStatusDamageReductionBonus,
} from "./dungeonLadder";

// 던전 깊이(depth)의 사다리 배율로 Monster 의 hp/atk/def/magicDef/exp/accuracy/evasion/
// statusDamageReductionPct 를 조정한다.
// skill/phaseTrigger/drops/태그 등은 그대로 — 동작 단순화 + 베이스 곡선 의존.
// 결과는 새 객체 — 호출자가 mutate 해도 베이스 MONSTERS 안 깨짐.
//
// 배율 출처 = dungeonLadder(§5.1): 들판(깊이 1~6) = ×1.0→×1.3 완만(온보딩 평탄), 7+ = 프론티어
//   밴드 hp/atk 선형 · def 댐핑(관통 0 절벽 회피) · exp 램프→소프트캡 후 우상향. depth 무한.
//   ⚠️ 계수 sim 캘리브 대상.
export function scaleMonsterForFloor(
  monster: Monster,
  depth: number,
  // 엔드게임 완화 적용 여부. 솔로 던전 사냥=true(기본). 협동 보스는 sharedMaxHp+anchorDepth 로
  //   난이도를 따로 튜닝하므로 false(앵커 깊이 24·42 가 완화 임계 위라 atk 가 의도치 않게 약화되는 것 방지).
  softenEndgame: boolean = true,
): Monster {
  // 엔드게임·프론티어 진입·43+ 확장 완화는 기본 HP/ATK 성장에 적용하고, 그 뒤 상위 난도를
  // 내구·공격·방어·명중·회피 축으로 분산한다. 권장 전투력은 표시용이며 몬스터 능력치를 바꾸지 않는다.
  const baseCombatMult =
    floorStatMult(depth) *
    (softenEndgame
      ? endgameSoften(depth) *
        frontierOnsetSoften(depth) *
        endExtensionCombatSoften(depth)
      : 1);
  const hpMult =
    baseCombatMult *
    (softenEndgame ? fixedFrontierDurabilityMult(depth) : 1) *
    (softenEndgame ? lateDurabilityMult(depth) : 1);
  const atkMult =
    baseCombatMult *
    (softenEndgame ? fixedFrontierAttackMult(depth) : 1) *
    (softenEndgame ? lateAttackMult(depth) : 1);
  const dMult =
    floorDefMult(depth) *
    (softenEndgame ? fixedFrontierDefenseMult(depth) : 1) *
    (softenEndgame ? lateDefenseMult(depth) : 1);
  const eMult = floorExpMult(depth);
  // 크리 HP 상쇄 — HP 에만(atk/def/exp 무관). 크리 점감 곡선의 엔드 딜 손실 보전. coop(softenEndgame=false) 제외.
  const hpComp = softenEndgame ? floorCritHpComp(depth) : 1;
  const hp = Math.max(1, Math.round(monster.hp * hpMult * hpComp));
  const atk = Math.max(1, Math.round(monster.atk * atkMult));
  const def = Math.max(0, Math.round(monster.def * dMult));
  const magicDef =
    monster.magicDef == null
      ? undefined
      : Math.max(0, Math.round(monster.magicDef * dMult));
  const exp = Math.max(0, Math.round(monster.exp * eMult));
  // 몬스터 적중도 = 고유 적중도 + floorAccuracy(depth). 플레이어 회피 경감과 대결한다.
  // 소수값도 의미가 있으므로 반올림하지 않는다. 회피도·적중도는 플레이어 표시 전투력에도 반영된다.
  // 같은 깊이의 몬스터 능력치는 플레이어 표시 전투력과 관계없이 항상 같다.
  const accuracy =
    ((monster.accuracy ?? 0) + floorAccuracy(depth)) *
    (softenEndgame ? fixedFrontierAccuracyMult(depth) : 1) *
    (softenEndgame ? lateAccuracyMult(depth) : 1);
  const evasionPct =
    (monster.evasionPct ?? 0) +
    (softenEndgame ? fixedFrontierEvasionBonus(depth) : 0) +
    (softenEndgame ? lateEvasionBonus(depth) : 0);
  const statusDamageReductionPct = Math.min(
    80,
    Math.max(
      0,
      (monster.statusDamageReductionPct ?? 0) +
        (softenEndgame ? lateStatusDamageReductionBonus(depth) : 0),
    ),
  );
  if (
    hp === monster.hp &&
    atk === monster.atk &&
    def === monster.def &&
    magicDef === monster.magicDef &&
    exp === monster.exp &&
    accuracy === (monster.accuracy ?? 0) &&
    evasionPct === (monster.evasionPct ?? 0) &&
    statusDamageReductionPct === (monster.statusDamageReductionPct ?? 0)
  ) {
    return monster;
  }
  return {
    ...monster,
    hp,
    atk,
    def,
    ...(magicDef != null ? { magicDef } : {}),
    exp,
    accuracy,
    ...(evasionPct > 0 ? { evasionPct } : {}),
    ...(statusDamageReductionPct > 0 ? { statusDamageReductionPct } : {}),
  };
}

/**
 * 일반 사냥터 전용 스케일.
 *
 * 상태이상 피해 감소는 협동 보스·원정 등 특수 전투의 대응 능력치로만 사용한다.
 * 사냥터 몬스터의 베이스 저항과 깊이 보너스를 모두 제거해 중독·출혈 피해가
 * 일반 몬스터에게 원래 수치대로 적용되도록 한다.
 */
export function scaleMonsterForHunt(monster: Monster, depth: number): Monster {
  const scaled = scaleMonsterForFloor(monster, depth, true);
  if (scaled.statusDamageReductionPct == null) return scaled;

  const huntMonster = { ...scaled };
  delete huntMonster.statusDamageReductionPct;
  return huntMonster;
}
