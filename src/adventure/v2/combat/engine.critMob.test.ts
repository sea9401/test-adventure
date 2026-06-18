// 치명형 몬스터 (SPI 부활 PR-3b) — critPct 몹의 공격이 치명타(×critMult)를 내고, 플레이어
// 치명저항(critResistPct=정신)이 그 확률을 %p 차감하는지 검증. critPct 0(잡몹)은 굴림 스킵 =
// 기존 동작(byte-identical). 결정성 위해 critPct 100(항상 치명)/0(항상 비치명)으로 굴림 고정.
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
    atk: 1, // 몹(99999 HP) 못 죽임 → 몹이 살아 공격
    def: 0, // damageBetween(atk, 0) = atk → 치명 배수 검증 단순화
    magicDef: 0,
    critResistPct: 0,
    spd: 1,
    ...over,
  };
}

const baseMob: Monster = {
  name: "도적",
  tags: ["humanoid"],
  hp: 99999,
  atk: 100,
  def: 0,
  spd: 99,
  exp: 1,
};

function damageTaken(player: PlayerCombat, enemy: Monster, turns = 3): number {
  let s = initialBattleState(player, enemy, "용사");
  for (let i = 0; i < turns && s.phase !== "ended"; i++) {
    s = advanceTurn(s, player, "용사");
  }
  return player.maxHp - s.playerHp;
}

describe("치명형 몬스터(critPct) — 정신(critResist)이 카운터", () => {
  const noResist = combatant({ critResistPct: 0 });

  it("치명형 몹(critPct100, 기본 ×1.5)은 일반 몹보다 큰 피해", () => {
    const critMob: Monster = { ...baseMob, critPct: 100 }; // critMult 기본 1.5
    const normalMob: Monster = { ...baseMob, critPct: 0 };
    const critTakes = damageTaken(noResist, critMob);
    const normalTakes = damageTaken(noResist, normalMob);
    // atk100·def0 → 일반 100/타, 치명 floor(100×1.5)=150/타.
    expect(critTakes).toBeGreaterThan(normalTakes);
    expect(critTakes).toBe(Math.floor(normalTakes * 1.5));
  });

  it("critMult 명시 시 그 배수로 치명", () => {
    const critMob: Monster = { ...baseMob, critPct: 100, critMult: 2.0 };
    const normalMob: Monster = { ...baseMob, critPct: 0 };
    expect(damageTaken(noResist, critMob)).toBe(damageTaken(noResist, normalMob) * 2);
  });

  it("치명저항(정신)이 몹 치명확률을 %p 차감 — critResist≥critPct 면 치명 무효", () => {
    const critMob: Monster = { ...baseMob, critPct: 100 };
    const resistant = combatant({ critResistPct: 100 }); // 100-100=0 → 치명 안 터짐
    const normalMob: Monster = { ...baseMob, critPct: 0 };
    expect(damageTaken(resistant, critMob)).toBe(damageTaken(resistant, normalMob));
  });

  it("critPct 미지정/0 = 치명 없음(byte-identical)", () => {
    const undefMob: Monster = { ...baseMob }; // critPct 없음
    const zeroMob: Monster = { ...baseMob, critPct: 0 };
    expect(damageTaken(noResist, undefMob)).toBe(damageTaken(noResist, zeroMob));
  });

  it("치명 발동 시 로그에 [치명] 표기, 일반은 미표기", () => {
    const critMob: Monster = { ...baseMob, critPct: 100 };
    const normalMob: Monster = { ...baseMob, critPct: 0 };
    let sc = initialBattleState(noResist, critMob, "용사");
    sc = advanceTurn(sc, noResist, "용사");
    expect(sc.log.some((e) => (e.text ?? "").includes("[치명]"))).toBe(true);
    let sn = initialBattleState(noResist, normalMob, "용사");
    sn = advanceTurn(sn, noResist, "용사");
    expect(sn.log.some((e) => (e.text ?? "").includes("[치명]"))).toBe(false);
  });
});
