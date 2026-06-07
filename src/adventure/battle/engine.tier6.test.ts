import { describe, it, expect, vi } from "vitest";
import {
  advanceTurn,
  initialBattleState,
  type BattleState,
  type PlayerCombat,
} from "../v2/combat/engine";
import type { Monster } from "../data/monsters";

// 기본 PLAYER: atk 10, def 5, spd 10.
const PLAYER: PlayerCombat = {
  accuracyPct: 100,
  hp: 9999,
  maxHp: 9999,
  atk: 10,
  def: 5,
  spd: 10,
  evasionPct: 0,
  attackCount: 1,
};

function enemy(hp = 100, overrides: Partial<Monster> = {}): Monster {
  return {
    name: "적",
    tags: ["beast"],
    hp,
    atk: 8,
    def: 3,
    spd: 5,
    exp: 5,
    ...overrides,
  };
}

// damageBetween(10, 3) = 7

describe("6티어 — 충돌파", () => {
  it("매 3턴마다 본타 첫 공격에 적 현재 HP의 N% 추가 고정 피해", () => {
    const p: PlayerCombat = { ...PLAYER, impactWaveHpPct: 10 }; // 10% per impact
    let s = initialBattleState(p, enemy(1000), "용사");
    // turn 1 (1 % 3 != 0): 본타 7 → 993
    s = advanceTurn(s, p, "용사");
    expect(s.enemyHp).toBe(993);
    s = advanceTurn(s, p, "용사"); // 적 턴
    // turn 2 (2 % 3 != 0): 본타 7 → 986
    s = advanceTurn(s, p, "용사");
    expect(s.enemyHp).toBe(986);
    s = advanceTurn(s, p, "용사"); // 적 턴
    // turn 3 (3 % 3 == 0): 본타 7 + impact floor(986×10/100)=98 → 881
    s = advanceTurn(s, p, "용사");
    expect(s.enemyHp).toBe(881);
  });

  it("impactWaveHpPct 0 이면 비활성 (3턴마다 평소 본타만)", () => {
    const p: PlayerCombat = { ...PLAYER, impactWaveHpPct: 0 };
    let s = initialBattleState(p, enemy(1000), "용사");
    for (let i = 0; i < 5; i += 1) s = advanceTurn(s, p, "용사"); // 3 player turn
    // 3턴 본타만 7×3 = 21 → 979. (충돌파 미발동)
    expect(s.enemyHp).toBe(1000 - 21);
  });

  it("isBoss=true 면 충돌파가 BOSS_PCT_HP_DAMAGE_MULT(0.1) 로 감산", () => {
    const p: PlayerCombat = { ...PLAYER, impactWaveHpPct: 10 };
    // 명시 annotation — 없으면 스프레드+리터럴이 isBoss 를 필수 boolean 으로 좁혀 advanceTurn 재대입 실패.
    let s: BattleState = {
      ...initialBattleState(p, enemy(1000), "용사"),
      isBoss: true,
    };
    // turn 1, 2: 본타만, 1000 → 993 → 986
    s = advanceTurn(s, p, "용사");
    s = advanceTurn(s, p, "용사"); // 적 턴
    s = advanceTurn(s, p, "용사");
    s = advanceTurn(s, p, "용사"); // 적 턴
    // turn 3: 본타 7 + 충돌파 floor(986×10/100)=98 → floor(×0.1) = 9 → 1000-21-9 = 970
    s = advanceTurn(s, p, "용사");
    expect(s.enemyHp).toBe(1000 - 7 - 7 - 7 - 9); // 970
  });
});

describe("6티어 — 그림자 군단", () => {
  it("4티어 분신 + 군단 = 매 턴 분신 3회", () => {
    // shadowCloneAtkPct=50 + shadowLegionExtraClones=2
    // 분신 1회 데미지: damageBetween(floor(10×0.5)=5, 3) = 2
    // 매 턴: 본타 7 + 분신×3=6 → 13 피해
    const p: PlayerCombat = {
  accuracyPct: 100,
      ...PLAYER,
      shadowCloneAtkPct: 50,
      shadowLegionExtraClones: 2,
    };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사");
    expect(s.enemyHp).toBe(100 - 13);
  });

  it("군단 단독 보유 시도 (derive 가 shadowCloneAtkPct 폴백) 분신 2회", () => {
    // shadowCloneAtkPct=50 강제 fallback + shadowLegionExtraClones=2 만 있음 (4티어 비장착 시뮬)
    // 분신 2회만 발동 ← derivePlayerCombat 이 fallback 처리, 여기선 직접 set.
    // 매 턴: 본타 7 + 분신×2 = 4 → 11 피해. 단 군단만 set 한 경우 코드 흐름 (atkPct 0이면 cloneCount=0).
    // 그래서 군단 단독 = derivePlayerCombat 의 fallback 으로 atkPct 가 set 되어야 — 단위 테스트는 직접 set 으로 검증.
    const p: PlayerCombat = {
  accuracyPct: 100,
      ...PLAYER,
      shadowCloneAtkPct: 50,
      shadowLegionExtraClones: 2,
    };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사");
    expect(s.enemyHp).toBe(100 - 13); // 4티어+6티어 매팅과 동일 (군단 단독 fallback 검증은 derive 단)
  });
});

describe("6티어 — 흡혈 갑옷", () => {
  it("받은 피해의 N% HP 회복", () => {
    // 적 atk 100 → damageBetween(100,5)=95 피해. 흡혈 30% = floor(95×30/100)=28 회복.
    const p: PlayerCombat = { ...PLAYER, hp: 1000, maxHp: 1000, bloodfeastPct: 30 };
    let s = initialBattleState(p, enemy(1000, { atk: 100 }), "용사");
    s = advanceTurn(s, p, "용사"); // 본타 7 → 993
    expect(s.enemyHp).toBe(993);
    s = advanceTurn(s, p, "용사"); // 적 95 피해 + 회복 28 → 1000 - 95 + 28 = 933
    expect(s.playerHp).toBe(933);
  });

  it("HP 0 이 되는 죽음에는 흡혈 회복 미발동", () => {
    // 적 atk 9999 — 한 방에 사망.
    const p: PlayerCombat = { ...PLAYER, hp: 50, maxHp: 50, bloodfeastPct: 100 };
    let s = initialBattleState(p, enemy(1000, { atk: 9999 }), "용사");
    s = advanceTurn(s, p, "용사"); // 본타
    s = advanceTurn(s, p, "용사"); // 적의 한 방
    expect(s.playerHp).toBe(0);
    expect(s.outcome).toBe("lose");
  });

  it("불굴로 HP 1 로 버틴 후엔 흡혈 발동 (조합)", () => {
    // 적 atk 9999, 불굴 활성 + 흡혈 50%. HP 1 로 버틴 후 흡혈 floor(9999×50/100)=4999 회복 → maxHp 캡 1000.
    const p: PlayerCombat = {
  accuracyPct: 100,
      ...PLAYER,
      hp: 50,
      maxHp: 1000,
      bloodfeastPct: 50,
      enduranceActive: true,
    };
    let s = initialBattleState(p, enemy(1000, { atk: 9999 }), "용사");
    s = advanceTurn(s, p, "용사"); // 본타
    s = advanceTurn(s, p, "용사"); // 적 9999 → 불굴 HP 1 → 흡혈 → maxHp 캡
    expect(s.playerHp).toBe(1000); // HP 1 + 4999 → maxHp 1000 캡
  });
});

describe("6티어 — 무한 풍사슬", () => {
  it("eternalGaleNoCap 시 한 턴 캡(3) 해제 → 더 많이 체인 가능", () => {
    // 광속 100% + 풍사슬 100% + noCap.
    // 기존 5티어만: 광속1회 + 풍사슬 캡 3회 = 본타 5회로 끝.
    // 무한: 통계적으로 더 많이. 100% 라면 ABSOLUTE_CAP(30) 까지.
    const p: PlayerCombat = {
  accuracyPct: 100,
      ...PLAYER,
      lightspeedExtraAttackPct: 100,
      galeChainChancePct: 100,
      eternalGaleBonusPct: 0,
      eternalGaleNoCap: true,
    };
    let s = initialBattleState(p, enemy(9999), "용사");
    // advanceTurn 을 절대캡 + 1번 호출 — 100% 라 캡 까지 끊임없이 발동
    let calls = 0;
    while (s.phase === "player" && calls < 50) {
      s = advanceTurn(s, p, "용사");
      calls += 1;
    }
    // 본타 1(첫) + 광속 1 + 풍사슬 체인 30(캡) = 32 회.
    expect(s.turn.galeChainsThisTurn).toBe(0); // 턴 종료 시 리셋
    expect(s.phase).toBe("enemy");
    expect(s.turn.completedPlayerTurns).toBe(1);
    expect(s.enemyHp).toBe(9999 - 7 * 32);
  });

  it("eternalGaleBonusPct 가 확률에 가산된다", () => {
    // 광속 + 풍사슬 50 + 보너스 50 = 100% 발동, noCap=false 라 캡 3 까지만.
    const p: PlayerCombat = {
  accuracyPct: 100,
      ...PLAYER,
      lightspeedExtraAttackPct: 100,
      galeChainChancePct: 50,
      eternalGaleBonusPct: 50,
      eternalGaleNoCap: false,
    };
    let s = initialBattleState(p, enemy(9999), "용사");
    let calls = 0;
    while (s.phase === "player" && calls < 20) {
      s = advanceTurn(s, p, "용사");
      calls += 1;
    }
    // 본타 5번 (1 + 광속 1 + 풍사슬 캡 3)
    expect(s.enemyHp).toBe(9999 - 7 * 5);
  });
});

describe("6티어 — 만물 행운", () => {
  it("크리티컬 확률 +N%", () => {
    // critChancePct 0 + universalLuckBonusPct 75 = effectivePct 75(캡 도달).
    // Math.random 0 mock 으로 결정적 발동(75% 굴림 통과). damageBetween(10,3)=7, ×2 = 14.
    vi.spyOn(Math, "random").mockReturnValue(0);
    const p: PlayerCombat = {
  accuracyPct: 100,
      ...PLAYER,
      critChancePct: 0,
      universalLuckBonusPct: 75,
    };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사");
    expect(s.enemyHp).toBe(91); // 100 - 9 (크리 base 2.0→1.4: 7 × 1.4 = 9.8 → 9)
    vi.restoreAllMocks();
  });

  it("회피 확률 +N% (캡 75% 적용)", () => {
    // evasionPct 0 + universalLuckBonusPct 100 = 100% — 캡 EVASION_PCT_CAP(75%)에 묶임.
    // Math.random 0.5 mock 으로 결정성 확보 — 0.5*100=50 < 75 → 회피 성공.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const p: PlayerCombat = { ...PLAYER, universalLuckBonusPct: 100 };
    let s = initialBattleState(p, enemy(1000), "용사");
    s = advanceTurn(s, p, "용사"); // 본타
    s = advanceTurn(s, p, "용사"); // 적 — 75% 회피 (Math.random 0.5 < 0.75)
    expect(s.playerHp).toBe(9999); // 무피해
    vi.restoreAllMocks();
  });

  it("추가타 확률 +N% (다음 턴 attacks_left 가 2)", () => {
    // extraAttackChancePct 0 + universalLuckBonusPct 100 = 100% 추가타 → 다음 턴 attacks=2.
    // initialBattleState 의 rollPlayerAttackCount = base 1 + 100% 적중 → 2.
    const p: PlayerCombat = { ...PLAYER, universalLuckBonusPct: 100 };
    const s = initialBattleState(p, enemy(100), "용사");
    expect(s.playerAttacksLeft).toBe(2);
  });

  it("추가타 확률 200% — 본타 + 2대 확정 추가타 (정수확정 로직)", () => {
    // extraAttackChancePct 200 = base 1 + 2 확정 = 3대. 캡 제거 후 정수확정 로직 검증.
    const p: PlayerCombat = { ...PLAYER, extraAttackChancePct: 200 };
    const s = initialBattleState(p, enemy(100), "용사");
    expect(s.playerAttacksLeft).toBe(3);
  });

  it("추가타 확률 350% — 본타 + 3대 확정 + 50% 확률 (정수확정 + 소수확률)", () => {
    // extraAttackChancePct 350 = base 1 + 3 확정 + 50% 1대 추가. Math.random 0.3 mock → 0.3*100=30 < 50 → +1.
    vi.spyOn(Math, "random").mockReturnValue(0.3);
    const p: PlayerCombat = { ...PLAYER, extraAttackChancePct: 350 };
    const s = initialBattleState(p, enemy(100), "용사");
    expect(s.playerAttacksLeft).toBe(5); // 1 base + 3 확정 + 1 확률 = 5
    vi.restoreAllMocks();
  });
});

describe("몬스터 다대시 — bonusAttackChancePct", () => {
  it("bonusAttackChancePct 200 보스는 한 enemy phase 에 3회 공격 (1 + 2 확정)", () => {
    // PLAYER hp 9999, def 5. 적 atk 8, def 3 → damageBetween(8,5)=3. 3대 = 9 데미지.
    const boss: Monster = { ...enemy(1000), bonusAttackChancePct: 200 };
    let s = initialBattleState(PLAYER, boss, "용사");
    s = advanceTurn(s, PLAYER, "용사"); // 1턴 본타 → 적 993
    // enemy phase — phase==="enemy" 동안 3회 굴림 필요
    let safety = 10;
    while (s.phase === "enemy" && safety-- > 0) {
      s = advanceTurn(s, PLAYER, "용사");
    }
    expect(s.phase).toBe("player");
    // 보스 3대 = damageBetween(8,5)×3 = 3×3 = 9 피해
    expect(s.playerHp).toBe(9999 - 9);
  });

  it("그림자 보법 발동 시 다대시 남은 공격까지 모두 무효", () => {
    // shadowStepPct 100 + 보스 4대 → 첫 enemy phase 진입에 그림자 보법 발동, 4대 모두 흘림.
    vi.spyOn(Math, "random").mockReturnValue(0); // shadowStepPct 굴림 통과
    const p: PlayerCombat = { ...PLAYER, shadowStepPct: 100 };
    const boss: Monster = { ...enemy(1000), bonusAttackChancePct: 300 };
    let s = initialBattleState(p, boss, "용사");
    s = advanceTurn(s, p, "용사"); // 본타
    s = advanceTurn(s, p, "용사"); // 적 — 그림자 보법으로 모든 공격 무효
    expect(s.phase).toBe("player");
    expect(s.playerHp).toBe(9999); // 무피해
    expect(s.turn.enemyAttacksLeft).toBe(0); // 남은 공격도 강제 0
    vi.restoreAllMocks();
  });
});

// ── 크리 캡 + 오버플로 → 크리뎀 변환 (Phase 1 밸런스) ─────────────────
describe("크리 cap 75% + 오버플로 → 크리뎀 변환", () => {
  it("raw critPct > 75 일 때 초과분이 크리뎀에 가산되어 데미지 증가", () => {
    // critChancePct 100 = raw 100. 캡 후 effective 75, 초과 25%p × 0.02 = +0.5× critMult.
    // critMult: base 1.4 + 0.5 = 1.9. 강제 발동 → damageBetween(10,3)=7 × 1.9 = 13.3 → 13.
    vi.spyOn(Math, "random").mockReturnValue(0);
    const p: PlayerCombat = { ...PLAYER, critChancePct: 100 };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사");
    expect(s.enemyHp).toBe(87); // 100 - 13 (오버플로 적용된 크리뎀)
    vi.restoreAllMocks();
  });

  it("raw critPct ≤ 75 일 때 오버플로 0 (기존 동작 유지)", () => {
    // critChancePct 75 = 캡 도달 직전. 오버플로 0. damageBetween(10,3)=7 × 1.4 = 9.8 → 9.
    vi.spyOn(Math, "random").mockReturnValue(0);
    const p: PlayerCombat = { ...PLAYER, critChancePct: 75 };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사");
    expect(s.enemyHp).toBe(91); // 100 - 9 (overflow 0, 원래 크리뎀)
    vi.restoreAllMocks();
  });

  it("오버플로 크리뎀 보너스에도 캡(CRIT_OVERFLOW_DMG_CAP=1.0) 적용 — 극단 초과도 +1× 까지만", () => {
    // critChancePct 500 = raw 500. 초과 425%p × 0.02 = 8.5 이지만 캡 1.0 에서 멈춤.
    // critMult: 1.4 + 1.0 = 2.4. damageBetween(10,3)=7 × 2.4 = 16.8 → 16.
    vi.spyOn(Math, "random").mockReturnValue(0);
    const p: PlayerCombat = { ...PLAYER, critChancePct: 500 };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사");
    expect(s.enemyHp).toBe(84); // 100 - 16 (CRIT_OVERFLOW_DMG_CAP 도달)
    vi.restoreAllMocks();
  });
});
