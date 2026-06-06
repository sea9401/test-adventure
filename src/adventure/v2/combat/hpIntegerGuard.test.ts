// HP 정수 가드 — 전투의 모든 피해·회복은 정수여야 한다(소수 HP·"출혈 5.96 피해" 류 차단).
//
// 배경: DoT(출혈/중독/연소) 틱이 ATK 계수(0.08)·%최대HP 비례라 소수로 새던 버그를 floor 로
// 막았는데(dotTickDamage), 앞으로 누가 DoT·반사·흡혈·재생류를 새로 추가하면서 floor 를 빠뜨리면
// 다시 소수가 샐 수 있다. 이 테스트가 회귀 가드 — 소수가 나오기 쉬운 계수로 무장한 빌드로
// 여러 턴을 돌려 매 턴 양측 HP 와 로그 숫자가 정수임을 못박는다. (특정 수치가 아니라 "정수냐"만
// 검증하므로 밸런스 튜닝에 영향받지 않는다.)
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  advanceTurn,
  initialBattleState,
  type PlayerCombat,
} from "./engine";
import { advanceTurnPvP, initialBattleStatePvP } from "./engine-pvp";
import type { Monster } from "@/adventure/data/monsters";

afterEach(() => {
  vi.restoreAllMocks();
});

// 소수가 나오기 쉬운 계수로 무장 — 출혈(3 + ATK×0.08)·중독(%최대HP)·반사(33%)·흡혈(33%)·
// 재생(%최대HP). floor 가 빠지면 즉시 소수가 되도록 나누어떨어지지 않는 값(maxHp 777·atk 37).
function leakyCombatant(over: Partial<PlayerCombat> = {}): PlayerCombat {
  return {
    accuracyPct: 100,
    evasionPct: 0,
    attackCount: 1,
    hp: 777,
    maxHp: 777,
    atk: 37,
    def: 5,
    spd: 10,
    bleedOnHit: { flatPerStack: 3, atkCoefPerStack: 0.08 }, // 5.96/스택
    poisonOnHit: { pctMaxHpPerStack: 0.0016 }, // 적 HP×0.0016
    thornsPct: 33, // 피격분 33% 반사
    luckyLifestealPct: 33, // 가한 피해 33% 흡혈
    enchantRegenPctPerTurn: 7, // 777×0.07 = 54.39
    passiveTurnHealPctMaxHp: 3, // 777×0.03 = 23.31
    ...over,
  };
}

describe("HP 정수 가드 — DoT·반사·흡혈·재생이 소수 HP/피해를 만들지 않는다", () => {
  it("PvE: 다계통(출혈·중독·반사·흡혈·재생) 전투 내내 HP 가 정수", () => {
    const player = leakyCombatant();
    const enemy: Monster = {
      name: "적",
      tags: ["beast"],
      hp: 555,
      atk: 40,
      def: 3,
      spd: 5,
      exp: 5,
    };
    let s = initialBattleState(player, enemy, "용사");
    const nonInt: string[] = [];
    for (let i = 0; i < 12 && s.phase !== "ended"; i++) {
      s = advanceTurn(s, player, "용사");
      if (!Number.isInteger(s.playerHp)) nonInt.push(`턴${i} playerHp=${s.playerHp}`);
      if (!Number.isInteger(s.enemyHp)) nonInt.push(`턴${i} enemyHp=${s.enemyHp}`);
    }
    expect(nonInt).toEqual([]);
    // 로그에도 소수 숫자가 없어야("출혈 5.96 피해"·"HP +54.39" 류). 전투 로그가 의도적으로
    // 소수를 표기하지 않는다는 전제 — 만약 "회피율 37.5%" 같은 소수 표기 로그가 새로 생기면
    // 이 스캔을 피해/회복 라인으로 좁혀야 한다.
    const decimalLines = s.log
      .map((e) => e.text ?? "")
      .filter((t) => /\d+\.\d+/.test(t));
    expect(decimalLines).toEqual([]);
  });

  it("PvP: 양 측이 다계통 능력을 써도 매 턴 양쪽 HP 가 정수", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // 적중 확정(미스/확률효과 고정) — 정수성은 RNG 무관
    let s = initialBattleStatePvP(
      leakyCombatant({ spd: 15 }),
      leakyCombatant({ spd: 5, hp: 800, maxHp: 800, atk: 41 }),
      "P1",
      "P2",
    );
    const nonInt: string[] = [];
    for (let i = 0; i < 14 && s.phase !== "ended"; i++) {
      s = advanceTurnPvP(s);
      if (!Number.isInteger(s.p1.hp)) nonInt.push(`턴${i} p1=${s.p1.hp}`);
      if (!Number.isInteger(s.p2.hp)) nonInt.push(`턴${i} p2=${s.p2.hp}`);
      if (s.p1.hp <= 0 || s.p2.hp <= 0) break;
    }
    expect(nonInt).toEqual([]);
  });
});
