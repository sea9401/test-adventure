// 몹 더블어택 버그 수정 — 몹이 스킬을 시전한 턴엔 평타를 생략한다(스킬이 평타를 대체 = 플레이어
// 와 대칭). 기존엔 몹이 스킬 cast 후에도 resolveEnemyPhase 평타가 같이 발동해 한 턴 2번 때렸다.
// skipEnemyBasicAttack(advanceTurn) → skipBasicAttack(resolveEnemyPhase) 경로를 직접 검증.
import { describe, it, expect } from "vitest";
import {
  advanceTurn,
  initialBattleState,
  type PlayerCombat,
} from "./engine";
import type { Monster } from "@/adventure/data/monsters";

function combatant(over: Partial<PlayerCombat> = {}): PlayerCombat {
  return {
    accuracyPct: 100,
    evasionPct: 0,
    attackCount: 1,
    hp: 5000,
    maxHp: 5000,
    atk: 1, // 몹(99999 HP) 못 죽임 → 몹 턴 도달
    def: 0, // damageBetween(atk,0)=atk → 평타 100 고정
    magicDef: 0,
    critResistPct: 0,
    spd: 1,
    ...over,
  };
}

const baseMob: Monster = {
  name: "주술 도적",
  tags: ["humanoid"],
  hp: 99999,
  atk: 100,
  def: 0,
  spd: 99,
  exp: 1,
};

describe("몹 스킬 시전 턴 평타 생략 (더블어택 fix)", () => {
  const player = combatant();

  // 첫 적 페이즈 진입 직전 state(같은 state 에서 skip on/off 비교).
  function enemyPhaseState() {
    let s = initialBattleState(player, baseMob, "용사");
    let guard = 0;
    while (s.phase !== "enemy" && s.phase !== "ended" && guard++ < 10) {
      s = advanceTurn(s, player, "용사");
    }
    expect(s.phase).toBe("enemy");
    return s;
  }

  it("skip=false → 몹 평타 발동(피해 100), skip=true → 평타 생략(피해 0)", () => {
    const s = enemyPhaseState();
    const noSkip = advanceTurn(s, player, "용사", { kind: "attack" }, false);
    const skip = advanceTurn(s, player, "용사", { kind: "attack" }, true);
    expect(player.maxHp - noSkip.playerHp).toBe(100); // 평타 적중
    expect(player.maxHp - skip.playerHp).toBe(0); // 평타 생략
  });

  it("skip=true 여도 적 페이즈는 정상 종료(다음 player 턴으로 전환)", () => {
    const s = enemyPhaseState();
    const skip = advanceTurn(s, player, "용사", { kind: "attack" }, true);
    expect(skip.phase).toBe("player");
  });

  it("기본값(skip 미전달)은 기존 동작 — 평타 발동(byte-identical 근거)", () => {
    const s = enemyPhaseState();
    const def = advanceTurn(s, player, "용사"); // skipEnemyBasicAttack 기본 false
    expect(player.maxHp - def.playerHp).toBe(100);
  });
});
