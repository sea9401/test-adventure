// PvP 엔진의 AP 스킬 시스템 미러 — engine.apSkills.test.ts 의 PvE 시나리오를 양면에서 검증.
// PR-1c. PvP 는 양쪽이 PlayerCombat 이라 "공격자/방어자" 가 매 페이즈 토글된다 — AP 자원·
// turn 게이트(apSkillFiredThisTurn)·전투 시작 ap 가 양 사이드에 독립적으로 유지되어야 한다.

import { describe, it, expect } from "vitest";
import {
  advanceTurnPvP,
  initialBattleStatePvP,
  type PvPBattleState,
} from "./engine-pvp";
import type { EquippedAPSkill, PlayerCombat } from "./engine";
import {
  getAPSkillByName,
  DEFAULT_AP_SKILL_CONDITION,
  type APSkill,
  type APSkillCondition,
} from "../character/apSkills";

// 슬롯 발동 조건은 기본 "always" — AP 스킬 효과 검증 자체에 집중.
function slot(
  skill: APSkill,
  condition: APSkillCondition = DEFAULT_AP_SKILL_CONDITION,
): EquippedAPSkill {
  return { skill, condition };
}

const BASE: PlayerCombat = {
  hp: 9999,
  maxHp: 9999,
  atk: 10,
  def: 5,
  spd: 10,
  evasionPct: 0,
  attackCount: 1,
};

const SHADOW_CUT = getAPSkillByName("그림자 베기")!;
const MENDING = getAPSkillByName("회복술")!;
const DEEP_WOUND = getAPSkillByName("깊은 상처")!;
const EXTRA_EVADE = getAPSkillByName("추가 회피")!;
const HEAVEN_SLAY = getAPSkillByName("천살")!;

// 양 사이드 selectAPSkill 검증을 단순화 — 페이즈가 self 일 때 attack 단발.
function attack(s: PvPBattleState): PvPBattleState {
  return advanceTurnPvP(s, { kind: "attack" });
}

describe("PvP AP — 초기화", () => {
  it("양쪽 미장착 → 양쪽 ap 0", () => {
    const s = initialBattleStatePvP(BASE, BASE, "p1", "p2");
    expect(s.p1.ap).toBe(0);
    expect(s.p2.ap).toBe(0);
    expect(s.p1.turn.apSkillFiredThisTurn).toBeNull();
    expect(s.p2.turn.apSkillFiredThisTurn).toBeNull();
  });

  it("p1 만 장착 → p1.ap = 시작 AP(2), p2.ap = 0", () => {
    const p1: PlayerCombat = { ...BASE, equippedAPSkills: [slot(SHADOW_CUT)] };
    const s = initialBattleStatePvP(p1, BASE, "p1", "p2");
    expect(s.p1.ap).toBe(2);
    expect(s.p2.ap).toBe(0);
  });
});

describe("PvP AP — 그림자 베기 (atk_multiplier + ignoresDef)", () => {
  // damageBetween(10, 5) = 5. AP 발동 시 damageBetween(15, 0) = 15. variance 고려해 비교.
  it("p1 발동 턴 — 평타보다 큰 한 방", () => {
    const p1: PlayerCombat = { ...BASE, equippedAPSkills: [slot(SHADOW_CUT)] };
    let s = initialBattleStatePvP(p1, BASE, "p1", "p2");
    // turn 1 (p1): AP 2 < 3 → 평타.
    s = attack(s);
    const dmgTurn1 = BASE.hp - s.p2.hp;
    // turn 1 (p2): 적 평타.
    s = attack(s);
    // turn 2 (p1): AP 3 → 발동.
    const beforeTurn2 = s.p2.hp;
    s = attack(s);
    const dmgTurn2 = beforeTurn2 - s.p2.hp;
    expect(dmgTurn2).toBeGreaterThan(dmgTurn1);
    // AP 발동 후 차감: max(0, min(5, 3+1) - 3) = 1. 시작 2 + 1턴 회복 +1 = 3, 다음 턴 +1 = 4, - cost 3 → 1.
    expect(s.p1.ap).toBe(1);
  });

  it("p2 도 동등하게 발동 — 양면 대칭", () => {
    const p2: PlayerCombat = { ...BASE, equippedAPSkills: [slot(SHADOW_CUT)] };
    // p1 선공이 안 되도록 p1 의 SPD 를 낮춰 p2 선공.
    const p1: PlayerCombat = { ...BASE, spd: 5 };
    let s = initialBattleStatePvP(p1, p2, "p1", "p2");
    expect(s.phase).toBe("p2"); // p2 선공
    // turn 1 (p2): AP 2 < 3 → 평타. dmg 기록.
    const beforeP2Turn1 = s.p1.hp;
    s = attack(s);
    const dmgP2Turn1 = beforeP2Turn1 - s.p1.hp;
    // turn 1 (p1): 평타.
    s = attack(s);
    // turn 2 (p2): AP 3 → 발동, 평타보다 큰 한 방.
    const beforeP2Turn2 = s.p1.hp;
    s = attack(s);
    expect(beforeP2Turn2 - s.p1.hp).toBeGreaterThan(dmgP2Turn1);
    expect(s.p2.ap).toBe(1);
  });
});

describe("PvP AP — 회복술 (heal_pct)", () => {
  it("p1 발동 시 자가 회복, 적은 회복 안 함", () => {
    const wounded: PlayerCombat = {
      ...BASE,
      hp: 1000,
      maxHp: 4000,
      equippedAPSkills: [slot(MENDING)],
    };
    let s = initialBattleStatePvP(wounded, BASE, "p1", "p2");
    expect(s.p1.hp).toBe(1000);
    // turn 1 (p1): AP 2 < 3 → 미발동.
    s = attack(s);
    expect(s.p1.hp).toBe(1000);
    // turn 1 (p2): 적 평타 — p1 HP 감소.
    s = attack(s);
    const hpAfterEnemy = s.p1.hp;
    // turn 2 (p1): AP 3 → 발동, maxHp 25% = +1000 회복.
    s = attack(s);
    expect(s.p1.hp).toBeGreaterThan(hpAfterEnemy);
    expect(s.p1.hp - hpAfterEnemy).toBeGreaterThanOrEqual(1000);
  });
});

describe("PvP AP — 깊은 상처 (apply_bleed)", () => {
  it("발동 시 attacker.stacks.bleedStacksOnOpponent +5", () => {
    const p1: PlayerCombat = { ...BASE, equippedAPSkills: [slot(DEEP_WOUND)] };
    let s = initialBattleStatePvP(p1, BASE, "p1", "p2");
    expect(s.p1.stacks.bleedStacksOnOpponent).toBe(0);
    s = attack(s); // turn 1 p1: AP 2 < 3
    s = attack(s); // p2
    expect(s.p1.stacks.bleedStacksOnOpponent).toBe(0);
    s = attack(s); // turn 2 p1: 발동
    expect(s.p1.stacks.bleedStacksOnOpponent).toBe(5);
  });
});

describe("PvP AP — 추가 회피 (add_guaranteed_evades)", () => {
  it("발동 시 attacker 의 evadesRemaining +1 (1 AP — 첫 턴 발동)", () => {
    const p1: PlayerCombat = {
      ...BASE,
      equippedAPSkills: [slot(EXTRA_EVADE)],
      guaranteedEvades: 0,
    };
    let s = initialBattleStatePvP(p1, BASE, "p1", "p2");
    expect(s.p1.stacks.evadesRemaining).toBe(0);
    // 첫 턴: AP 1 cost — 즉시 발동.
    s = attack(s);
    expect(s.p1.stacks.evadesRemaining).toBe(1);
  });
});

describe("PvP AP — 천살 (ignoresEvasion + ignoresDef)", () => {
  it("회피 100% 적 상대로도 큰 한 방 발동 — dodge cascade 우회", () => {
    const p1: PlayerCombat = { ...BASE, atk: 10, equippedAPSkills: [slot(HEAVEN_SLAY)] };
    const wall: PlayerCombat = { ...BASE, evasionPct: 100, def: 50 };
    let s = initialBattleStatePvP(p1, wall, "p1", "p2");
    const startHp = s.p2.hp;
    let biggestHit = 0;
    let prev = startHp;
    // p1 페이즈만 검사: 매 라운드 attack 2회 (p1, p2). p1 의 ATK ×3=30, DEF 무시.
    for (let i = 0; i < 30; i++) {
      const before = s.p2.hp;
      s = attack(s);
      const delta = before - s.p2.hp;
      if (delta > biggestHit) biggestHit = delta;
      prev = s.p2.hp;
      if (s.phase === "ended") break;
    }
    expect(biggestHit).toBeGreaterThanOrEqual(25);
  });
});

describe("PvP AP — 턴당 1회 정책 + AP 회복", () => {
  it("같은 턴 추가타엔 AP 스킬 재발동 안 함", () => {
    const p1: PlayerCombat = {
      ...BASE,
      equippedAPSkills: [slot(SHADOW_CUT)],
      attackCount: 2, // 한 턴 2회 공격
    };
    let s = initialBattleStatePvP(p1, BASE, "p1", "p2");
    // 첫 턴 (p1): AP 2 — 평타 ×2. 매 공격 +1 AP → 2 → 3 → 4.
    s = attack(s); // 첫 공격 (firstAttackPending)
    s = attack(s); // 둘째 공격 (같은 페이즈, firstAttackPending=false)
    // p1 페이즈 종료 후 attacksLeft 0 → endAttackerPhase → 페이즈 p2 로.
    expect(s.phase).toBe("p2");
    expect(s.p1.turn.apSkillFiredThisTurn).toBeNull(); // 발동 안 함
    expect(s.p1.ap).toBe(4); // 2 → 3 → 4
  });

  it("회피 당해도 attacker AP +1 (행동 시도이므로)", () => {
    const p1: PlayerCombat = { ...BASE, equippedAPSkills: [slot(SHADOW_CUT)] };
    // p2 가 회피 강화 1 보유 — p1 첫 공격이 자동 회피됨.
    const dodger: PlayerCombat = { ...BASE, guaranteedEvades: 1 };
    let s = initialBattleStatePvP(p1, dodger, "p1", "p2");
    expect(s.p1.ap).toBe(2);
    s = attack(s); // p1 의 1회 공격이 보장 회피로 빗남 → endAttackerPhase.
    expect(s.p1.ap).toBe(3); // +1 (cost 차감 X — 발동 안 됨)
    expect(s.p1.turn.apSkillFiredThisTurn).toBeNull();
  });
});

// ── PR-2/3/4 새 효과 미러 ──────────────────────────────────────────────────
const RESOLVE = getAPSkillByName("결의")!;
const EXPOSE = getAPSkillByName("약점 노출")!;
const MADNESS = getAPSkillByName("광기")!;
const SLOW = getAPSkillByName("둔화")!;
const FRENZY = getAPSkillByName("폭주")!;
const FOCUSED = getAPSkillByName("집중의 호흡")!;
const COMBO = getAPSkillByName("연환격")!;
const STORM = getAPSkillByName("폭풍 일격")!;
const MAD_SLASH = getAPSkillByName("광살참")!;
const THUNDER = getAPSkillByName("천뢰 일격")!;
const LIGHT_GLIDE = getAPSkillByName("빛의 활공")!;
const PURIFY = getAPSkillByName("정화")!;
const AFTERIMAGE = getAPSkillByName("잔상")!;

describe("PvP AP — 결의 (player_dmg_reduction)", () => {
  it("발동 후 같은 라운드 받는 피해 -pct% 적용", () => {
    // p1 이 결의 발동 (AP 2) → 즉시 p1.buffs.playerDmgReductionPct/turnsLeft 셋.
    // 그 직후 p2 페이즈에서 p1 이 받는 피해가 줄어야 함.
    const p1: PlayerCombat = { ...BASE, hp: 5000, maxHp: 5000, equippedAPSkills: [slot(RESOLVE)] };
    let s = initialBattleStatePvP(p1, BASE, "p1", "p2");
    s = attack(s); // p1 turn 1: AP 2 → 결의 발동
    expect(s.p1.buffs.playerDmgReductionTurnsLeft).toBe(1);
    expect(s.p1.buffs.playerDmgReductionPct).toBe(50);
    // 비교군 — 결의 없이 같은 시나리오.
    const p1NoBuff: PlayerCombat = { ...BASE, hp: 5000, maxHp: 5000 };
    let s2 = initialBattleStatePvP(p1NoBuff, BASE, "p1", "p2");
    s2 = attack(s2); // p1 turn 1
    const before = s.p1.hp;
    const before2 = s2.p1.hp;
    s = attack(s); // p2 → p1 (결의 active)
    s2 = attack(s2); // p2 → p1 (no buff)
    expect(before - s.p1.hp).toBeLessThan(before2 - s2.p1.hp);
  });
});

describe("PvP AP — 약점 노출 (enemy_def_debuff)", () => {
  it("발동 후 후속 공격에서 상대 DEF -pct% 적용", () => {
    const p1: PlayerCombat = { ...BASE, atk: 100, equippedAPSkills: [slot(EXPOSE)] };
    const wall: PlayerCombat = { ...BASE, def: 80 };
    let s = initialBattleStatePvP(p1, wall, "p1", "p2");
    s = attack(s); // p1: 약점노출 발동 (이 공격 자체엔 효과 X)
    expect(s.p1.buffs.enemyDefDebuffPct).toBe(25);
    expect(s.p1.buffs.enemyDefDebuffTurnsLeft).toBe(3);
    s = attack(s); // p2
    // 다음 p1 턴 — DEF 감소 적용된 데미지.
    const before = s.p2.hp;
    s = attack(s);
    const dmgWithDebuff = before - s.p2.hp;
    expect(dmgWithDebuff).toBeGreaterThan(0);
  });
});

describe("PvP AP — 광기 (player_atk_buff + def_debuff)", () => {
  it("발동 시 ATK 버프 + DEF 디버프 셋업", () => {
    const p1: PlayerCombat = { ...BASE, equippedAPSkills: [slot(MADNESS)] };
    let s = initialBattleStatePvP(p1, BASE, "p1", "p2");
    s = attack(s); // p1 turn 1: AP 2 < 3 → 미발동
    s = attack(s); // p2
    s = attack(s); // p1 turn 2: AP 3 → 광기 발동
    expect(s.p1.buffs.playerAtkBuffPct).toBe(30);
    expect(s.p1.buffs.playerDefDebuffPct).toBe(15);
    expect(s.p1.buffs.playerAtkBuffTurnsLeft).toBe(3);
  });

  it("발동턴 그림자 분신 추가타에도 광기 ATK 보너스 적용 (회귀 가드)", () => {
    // p1: ATK 100, 분신 100% 1회. p2: DEF 0. 광기 발동 turn 메인 130 + 분신 130 = 260.
    const p1: PlayerCombat = {
      ...BASE,
      hp: 99999,
      maxHp: 99999,
      atk: 100,
      def: 0,
      shadowCloneAtkPct: 100,
      equippedAPSkills: [slot(MADNESS)],
    };
    const p2: PlayerCombat = { ...BASE, hp: 99999, maxHp: 99999, atk: 1, def: 0 };
    let s = initialBattleStatePvP(p1, p2, "p1", "p2");
    s = attack(s); // p1 turn 1: AP 2 < 3 미발동. 메인 100 + 분신 100 = 200.
    s = attack(s); // p2 turn.
    const hpBefore = s.p2.hp;
    s = attack(s); // p1 turn 2: 광기 발동, 메인 130 + 분신 130 = 260.
    expect(s.p1.buffs.playerAtkBuffTurnsLeft).toBe(3);
    expect(hpBefore - s.p2.hp).toBe(260);
  });
});

describe("PvP AP — 둔화·폭주 (SPD mult)", () => {
  it("둔화 — 발동 후 상대 SPD 절반", () => {
    const p1: PlayerCombat = { ...BASE, equippedAPSkills: [slot(SLOW)] };
    let s = initialBattleStatePvP(p1, BASE, "p1", "p2");
    s = attack(s); // turn 1: AP 2 → 둔화 발동
    expect(s.p1.buffs.enemySpdMult).toBe(0.5);
    expect(s.p1.buffs.enemySpdTurnsLeft).toBe(2);
  });

  it("폭주 — 발동 후 자기 SPD ×1.5", () => {
    const p1: PlayerCombat = { ...BASE, equippedAPSkills: [slot(FRENZY)] };
    let s = initialBattleStatePvP(p1, BASE, "p1", "p2");
    s = attack(s); // turn 1: AP 2 < 4
    s = attack(s); // p2
    s = attack(s); // turn 2: AP 3 < 4
    s = attack(s); // p2
    s = attack(s); // turn 3: AP 4 → 폭주 발동
    expect(s.p1.buffs.playerSpdMult).toBe(1.5);
    expect(s.p1.buffs.playerSpdTurnsLeft).toBe(3);
  });
});

describe("PvP AP — 집중의 호흡 (crit_buff_next_attack)", () => {
  it("발동 후 다음 평타가 강제 크리 + 크리뎀 보너스", () => {
    // 발동 attack 자체는 본타에 영향 X. 발동 후 첫 평타가 크리.
    // attackCount=3 으로 한 턴 안에 발동+발사+평타 시퀀스 확보.
    const p1: PlayerCombat = {
      ...BASE,
      attackCount: 3,
      equippedAPSkills: [slot(FOCUSED)],
      critChancePct: 0,
    };
    let s = initialBattleStatePvP(p1, BASE, "p1", "p2");
    s = attack(s); // p1 첫 공격 — AP 2 → 집중호흡 발동, focusedBreathCritDmgBonusPct 셋
    expect(s.p1.turn.focusedBreathCritDmgBonusPct).toBe(30);
    s = attack(s); // p1 둘째 공격 — 강제 크리 발동, 큐 소비
    expect(s.p1.turn.critThisTurn).toBe(true);
    expect(s.p1.turn.focusedBreathCritDmgBonusPct).toBe(0);
  });
});

describe("PvP AP — 연환격 (extra_attack_this_turn)", () => {
  it("발동 시 이번 턴 attacksLeft +1", () => {
    const p1: PlayerCombat = { ...BASE, equippedAPSkills: [slot(COMBO)] };
    let s = initialBattleStatePvP(p1, BASE, "p1", "p2");
    s = attack(s); // turn 1: AP 2 → 연환격 발동, attacksLeft +1
    expect(s.phase).toBe("p1"); // 추가 공격이 있어 페이즈 안 끝남
    s = attack(s); // 추가 공격
    expect(s.phase).toBe("p2"); // 추가 공격 후 페이즈 종료
  });
});

describe("PvP AP — 폭풍 일격 (atk_plus_spd_pct_bonus)", () => {
  it("발동 시 본타 + (ATK × spdPct/100) 추가 데미지", () => {
    const p1: PlayerCombat = { ...BASE, atk: 100, equippedAPSkills: [slot(STORM)] };
    let s = initialBattleStatePvP(p1, BASE, "p1", "p2");
    s = attack(s); // turn 1: AP 2 < 3
    const dmgPlain = BASE.hp - s.p2.hp;
    s = attack(s); // p2
    const before = s.p2.hp;
    s = attack(s); // turn 2: AP 3 → 발동
    const dmgStorm = before - s.p2.hp;
    expect(dmgStorm).toBeGreaterThan(dmgPlain);
  });
});

describe("PvP AP — 광살참 (multi_hit_self_damage)", () => {
  it("발동 시 멀티히트 + 자해 HP", () => {
    const p1: PlayerCombat = { ...BASE, equippedAPSkills: [slot(MAD_SLASH)] };
    let s = initialBattleStatePvP(p1, BASE, "p1", "p2");
    // AP 4 까지 충전 필요.
    s = attack(s); // turn 1 (p1 AP 2 → 3 후 phase 종료) AP=3
    s = attack(s); // p2
    s = attack(s); // turn 2 p1 AP 3 → 4 후 phase 종료
    s = attack(s); // p2
    const beforeP2Hp = s.p2.hp;
    const beforeP1Hp = s.p1.hp;
    s = attack(s); // turn 3 p1 AP 4 → 광살참 발동
    expect(s.p1.hp).toBeLessThan(beforeP1Hp); // 자해
    // 멀티히트 — 평타보다 큰 한 방.
    expect(beforeP2Hp - s.p2.hp).toBeGreaterThan(10);
  });
});

describe("PvP AP — 천뢰 일격 (atk_multiplier_with_silence)", () => {
  it("발동 시 atk_multiplier 효과 (PvP 에선 silence 무효)", () => {
    const p1: PlayerCombat = { ...BASE, equippedAPSkills: [slot(THUNDER)] };
    let s = initialBattleStatePvP(p1, BASE, "p1", "p2");
    // 모든 attack 중 가장 큰 한 방 추적 — 발동된 attack 이 어디든 잡힘.
    let biggestHit = 0;
    for (let i = 0; i < 20; i++) {
      const before = s.p2.hp;
      s = attack(s);
      const delta = before - s.p2.hp;
      if (delta > biggestHit) biggestHit = delta;
      if (s.phase === "ended") break;
    }
    expect(biggestHit).toBeGreaterThanOrEqual(20); // ATK 10 × 2.5 = 25, vs DEF 5 → 20
  });
});

describe("PvP AP — 빛의 활공 (queued_extra_attacks_next_turn)", () => {
  it("발동 시 다음 자기 턴 attacksLeft +3", () => {
    const p1: PlayerCombat = { ...BASE, equippedAPSkills: [slot(LIGHT_GLIDE)] };
    let s = initialBattleStatePvP(p1, BASE, "p1", "p2");
    // AP 5 까지 — p1 만 행동 → 매 +1 cap 5.
    for (let i = 0; i < 7; i++) {
      if (s.phase === "ended") break;
      s = attack(s);
    }
    // 빛의 활공 발동 후 큐 = 3.
    expect(s.p1.turn.queuedExtraAttacks).toBe(3);
  });
});

describe("PvP AP — 정화 (cleanse_debuffs)", () => {
  it("발동 시 AP 1 cost 소비 (cleanse 자체는 idempotent)", () => {
    // 정화는 단발이라 발동 후 endAttackerPhase 의 turn 리셋 때문에 apSkillFiredThisTurn 가
    // null 로 돌아옴. AP 차감으로 발동 확인.
    const p1: PlayerCombat = { ...BASE, equippedAPSkills: [slot(PURIFY)] };
    let s = initialBattleStatePvP(p1, BASE, "p1", "p2");
    // 첫 턴 AP 2, PURIFY cost 1 → 발동. 회복 +1 후 -1 = 2. 그대로.
    s = attack(s);
    expect(s.p1.ap).toBe(2);
  });
});

describe("PvP AP — 잔상 (block_next_enemy_attack)", () => {
  it("발동 후 상대 다음 공격 1회 무효 + 카운터 1 소비", () => {
    const p1: PlayerCombat = { ...BASE, equippedAPSkills: [slot(AFTERIMAGE)] };
    let s = initialBattleStatePvP(p1, BASE, "p1", "p2");
    // AP 3 까지 충전.
    s = attack(s); // p1 turn 1 AP 2<3 평타
    s = attack(s); // p2
    s = attack(s); // p1 turn 2 AP 3 → 잔상 발동
    expect(s.p1.buffs.enemyAttackBlockedCount).toBe(1);
    // p2 가 공격해도 0 데미지 + 카운터 소비.
    const beforeHp = s.p1.hp;
    s = attack(s);
    expect(s.p1.hp).toBe(beforeHp);
    expect(s.p1.buffs.enemyAttackBlockedCount).toBe(0);
  });
});

describe("PvP AP — 슬롯 발동 조건", () => {
  it("ap_at_least 조건 — AP 임계 미달 시 발동 안 함", () => {
    const p1: PlayerCombat = {
      ...BASE,
      equippedAPSkills: [slot(SHADOW_CUT, { kind: "ap_at_least", value: 5 })],
    };
    let s = initialBattleStatePvP(p1, BASE, "p1", "p2");
    // 첫 턴 AP 2 — cost 3 충족 but 조건 (AP ≥ 5) 불충족.
    s = attack(s);
    expect(s.p1.turn.apSkillFiredThisTurn).toBeNull();
    expect(s.p1.ap).toBe(3); // 발동 안 했으므로 cost 차감 X
  });

  it("enemy_hp_below_pct 조건 — 적 HP 임계 미만에서만 발동", () => {
    const p1: PlayerCombat = {
      ...BASE,
      atk: 1000, // 한 방에 빠르게 깎기
      equippedAPSkills: [
        slot(SHADOW_CUT, { kind: "enemy_hp_below_pct", value: 50 }),
      ],
    };
    let s = initialBattleStatePvP(p1, BASE, "p1", "p2");
    // 적 HP 100% — 조건 미충족, AP 충전만.
    s = attack(s);
    expect(s.p1.turn.apSkillFiredThisTurn).toBeNull();
  });
});

const LIFESTEAL = getAPSkillByName("흡령")!;

describe("PvP AP — 흡령 (lifesteal_dmg_pct_turns)", () => {
  it("p1 발동 시 자기 사이드 buffs 에 lifestealPct/TurnsLeft 세팅", () => {
    const wounded: PlayerCombat = {
      ...BASE,
      hp: 1000,
      maxHp: 9999,
      atk: 100,
      equippedAPSkills: [slot(LIFESTEAL)],
    };
    let s = initialBattleStatePvP(wounded, BASE, "p1", "p2");
    expect(s.p1.buffs.playerLifestealTurnsLeft).toBe(0);
    // turn 1 p1: AP 2 < 4 — 미발동.
    s = attack(s);
    expect(s.p1.buffs.playerLifestealTurnsLeft).toBe(0);
    s = attack(s); // p2 평타.
    // turn 2 p1: AP 3 < 4 — 미발동.
    s = attack(s);
    expect(s.p1.buffs.playerLifestealTurnsLeft).toBe(0);
    s = attack(s); // p2 평타.
    // turn 3 p1: AP 4 — 발동.
    s = attack(s);
    expect(s.p1.buffs.playerLifestealTurnsLeft).toBe(3);
    expect(s.p1.buffs.playerLifestealPct).toBe(30);
    // 상대 buff 은 불변.
    expect(s.p2.buffs.playerLifestealTurnsLeft).toBe(0);
  });

  it("발동 다음 player 페이즈 진입 시 turnsLeft -1", () => {
    const wounded: PlayerCombat = {
      ...BASE,
      hp: 1000,
      maxHp: 9999,
      equippedAPSkills: [slot(LIFESTEAL)],
    };
    let s = initialBattleStatePvP(wounded, BASE, "p1", "p2");
    while (s.p1.buffs.playerLifestealTurnsLeft === 0 && s.outcome === null) {
      s = attack(s);
    }
    expect(s.p1.buffs.playerLifestealTurnsLeft).toBe(3);
    // p2 페이즈 진행 후 다시 p1 진입 — decrement.
    s = attack(s); // p2.
    s = attack(s); // p1 진입 + 공격 — decrement 됨.
    expect(s.p1.buffs.playerLifestealTurnsLeft).toBe(2);
  });
});
