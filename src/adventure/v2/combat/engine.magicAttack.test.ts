// 마법형 몬스터 (SPI 부활 PR-3a) — atkType:"magic" 몹의 공격이 플레이어 마법방어(magicDef=정신)로
// 경감되는지 검증. 물리방어 파이프라인 우회 = 물리탱크 약점·정신 빌드 카운터(대항 축). 미지정/
// physical 은 기존 물리 경로(byte-identical 회귀).
import { describe, it, expect, vi } from "vitest";
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
    atk: 1, // 몹(99999 HP)을 못 죽임 → 몹이 살아 공격
    def: 0,
    magicDef: 0,
    spd: 1, // 몹보다 느림 → 몹이 매 턴 공격
    ...over,
  };
}

const baseMob: Monster = {
  name: "정령",
  tags: ["spirit"],
  hp: 99999,
  atk: 200,
  def: 0,
  spd: 99,
  exp: 1,
};

// 고정 N턴 돌려 플레이어가 받은 총 피해(maxHp - playerHp). 양 빌드가 동일 몹·동일 spd라
// 피격 횟수가 같아 상대 비교가 견고하다.
function damageTaken(player: PlayerCombat, enemy: Monster, turns = 3): number {
  let s = initialBattleState(player, enemy, "용사");
  for (let i = 0; i < turns && s.phase !== "ended"; i++) {
    s = advanceTurn(s, player, "용사");
  }
  return player.maxHp - s.playerHp;
}

describe("마법형 몬스터(atkType:magic) — 마법방어(정신)로 경감", () => {
  const physDefBuild = combatant({ def: 500, magicDef: 0 }); // 물리탱크
  const magicDefBuild = combatant({ def: 0, magicDef: 500 }); // 정신 빌드

  it("마법 몹: 마방 빌드가 물리탱크보다 덜 맞는다(카운터 작동)", () => {
    const magicMob: Monster = { ...baseMob, atkType: "magic" };
    const physTakes = damageTaken(physDefBuild, magicMob);
    const magicTakes = damageTaken(magicDefBuild, magicMob);
    expect(magicTakes).toBeLessThan(physTakes);
    // 물리탱크는 magicDef 0 이라 거의 풀피해(atk200 − magicDef0).
    expect(physTakes).toBeGreaterThan(magicTakes * 2);
  });

  it("중간 수준 마법방어도 마법 피해를 체감 가능하게 낮춘다", () => {
    const magicMob: Monster = { ...baseMob, atkType: "magic" };
    const noCounter = damageTaken(combatant({ magicDef: 0 }), magicMob);
    const prepared = damageTaken(combatant({ magicDef: 120 }), magicMob);
    expect(prepared).toBeLessThan(noCounter * 0.5);
  });

  it("결계술 초반 감소는 지정된 적 행동 수 동안 마법형 평타에만 적용된다", () => {
    const magicMob: Monster = { ...baseMob, atkType: "magic" };
    const noCounter = damageTaken(combatant({ magicDef: 0 }), magicMob);
    const warded = damageTaken(
      combatant({
        magicDef: 0,
        passiveOpeningMagicDamageReductionPct: 10,
        passiveOpeningMagicDamageReductionPhases: 2,
      }),
      magicMob,
    );
    const physicalWarded = damageTaken(
      combatant({
        magicDef: 0,
        passiveOpeningMagicDamageReductionPct: 10,
        passiveOpeningMagicDamageReductionPhases: 2,
      }),
      { ...baseMob, atkType: "physical" },
    );

    expect(warded).toBe(noCounter - 40);
    expect(physicalWarded).toBe(noCounter);
  });

  it("결계술 초반 감소는 몬스터 마법 스킬 피해에도 적용된다", () => {
    const magicCaster: Monster = {
      ...baseMob,
      atkType: "magic",
      v2Skills: {
        learned: ["mob_arcane_bolt"],
        equipped: ["mob_arcane_bolt"],
      },
      v2MaxMp: 999,
    };
    const run = (player: PlayerCombat) => {
      const spy = vi.spyOn(Math, "random").mockReturnValue(0);
      try {
        return damageTaken(player, magicCaster, 1);
      } finally {
        spy.mockRestore();
      }
    };
    const plain = run(combatant({ magicDef: 0 }));
    const warded = run(
      combatant({
        magicDef: 0,
        passiveOpeningMagicDamageReductionPct: 10,
        passiveOpeningMagicDamageReductionPhases: 3,
      }),
    );

    expect(warded).toBe(Math.floor(plain * 0.9));
  });

  it("물리 몹: 물리방어로 경감 — magicDef 는 무용", () => {
    const physMob: Monster = { ...baseMob, atkType: "physical" };
    expect(damageTaken(physDefBuild, physMob)).toBeLessThan(
      damageTaken(magicDefBuild, physMob),
    );
  });

  it("atkType 미지정 = physical 과 동일(byte-identical 회귀)", () => {
    const undefMob: Monster = { ...baseMob }; // atkType 없음
    const physMob: Monster = { ...baseMob, atkType: "physical" };
    expect(damageTaken(physDefBuild, undefMob)).toBe(
      damageTaken(physDefBuild, physMob),
    );
    expect(damageTaken(magicDefBuild, undefMob)).toBe(
      damageTaken(magicDefBuild, physMob),
    );
  });

  it("마법 공격은 로그에 [마법] 표기, 물리는 미표기", () => {
    const magicMob: Monster = { ...baseMob, atkType: "magic" };
    const physMob: Monster = { ...baseMob, atkType: "physical" };
    let sm = initialBattleState(magicDefBuild, magicMob, "용사");
    sm = advanceTurn(sm, magicDefBuild, "용사");
    expect(sm.log.some((e) => (e.text ?? "").includes("[마법]"))).toBe(true);
    let sp = initialBattleState(physDefBuild, physMob, "용사");
    sp = advanceTurn(sp, physDefBuild, "용사");
    expect(sp.log.some((e) => (e.text ?? "").includes("[마법]"))).toBe(false);
  });
});
