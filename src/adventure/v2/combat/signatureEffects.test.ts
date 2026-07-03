import { describe, it, expect, vi, afterEach } from "vitest";
import {
  battleStartShield,
  formatChillSlowLog,
  formatShockSlowLog,
  healToShield,
  lowHpDamageReductionPct,
  onCritSpeedBuff,
  onCritEnemyChill,
  firesOnCritPoison,
  onDodgeHealAmount,
  onDodgeSpeedBuff,
  onHitTakenDefGain,
  onSkillCastMpRefund,
  rollOnHitPoison,
  rollOnHitShock,
  statusBlockOnce,
  everyNHitsValue,
} from "./signatureEffects";
import {
  advanceTurn,
  applyPlayerV2SkillCast,
  initialBattleState,
  resolveBattle,
} from "./engine";
import { pickAutoAction } from "./pickAutoAction";
import { derivePlayerCombatV2Pure } from "@/lib/server/derivePlayerCombatV2";
import { V2_MONSTERS } from "@/adventure/data/v2/v2Monsters";
import { emptyV2SkillsState } from "@/adventure/data/v2/v2Skills";
import type { SignatureEffect } from "@/adventure/data/v2/v2Equipment";

const CROWN: SignatureEffect = {
  trigger: "on_crit",
  label: "군림",
  spdBuffPct: 20,
  buffActions: 2,
};
const FANG: SignatureEffect = {
  trigger: "on_crit",
  label: "독니",
  poisonOnCrit: true,
};

const RELIC: SignatureEffect = {
  trigger: "low_hp",
  label: "성물",
  hpThresholdPct: 30,
  damageTakenReductionPct: 25,
};

const FROST: SignatureEffect = {
  trigger: "on_crit",
  label: "한기",
  chillSlowPct: 25,
  buffActions: 2,
};

const THUNDER_FANG: SignatureEffect = {
  trigger: "on_hit",
  label: "뇌운",
  shockChancePct: 15,
  shockSlowPct: 50,
  buffActions: 1,
};

const BLUE_VENOM: SignatureEffect = {
  trigger: "on_hit",
  label: "청독",
  poisonChancePct: 35,
  poisonStacks: 1,
};

const BONE_THRONE: SignatureEffect = {
  trigger: "on_hit_taken",
  label: "백왕좌",
  defGainOnHitPct: 35,
};

const BLACK_THRONE: SignatureEffect = {
  trigger: "battle_start",
  label: "검은 왕좌",
  battleStartShieldPctMaxHp: 12,
};

const CAIRN_STAR: SignatureEffect = {
  trigger: "on_skill_cast",
  label: "왕릉성",
  mpRefundPctOfCost: 25,
};

const RELIQUARY: SignatureEffect = {
  trigger: "on_heal",
  label: "묵주",
  healToShieldPct: 25,
};

const VOID_CROWN: SignatureEffect = {
  trigger: "status_block_once",
  label: "공허왕관",
  statusBlockOnce: true,
};

describe("onCritEnemyChill (동결의 갑주 한기 — 크리 시 적 둔화)", () => {
  it("시그니처 없음/빈 배열/미장착 → null (골든 byte-identical 가드)", () => {
    expect(onCritEnemyChill(undefined, true, true)).toBeNull();
    expect(onCritEnemyChill([], true, true)).toBeNull();
    expect(onCritEnemyChill([CROWN, FANG], true, true)).toBeNull(); // chillSlowPct 없음
  });

  it("크리 아님/피해 없음이면 미발동", () => {
    expect(onCritEnemyChill([FROST], false, true)).toBeNull();
    expect(onCritEnemyChill([FROST], true, false)).toBeNull();
  });

  it("크리+피해 시 슬로우 배수(<1)+지속행동 반환", () => {
    const r = onCritEnemyChill([FROST], true, true);
    expect(r).not.toBeNull();
    expect(r!.mult).toBeCloseTo(0.75); // 1 − 25%
    expect(r!.turns).toBe(2);
    expect(r!.mult).toBeLessThan(1); // 적을 늦춤
  });

  it("여러 개면 가장 강한 슬로우(가장 작은 배수)", () => {
    const strong: SignatureEffect = {
      trigger: "on_crit",
      label: "한기",
      chillSlowPct: 40,
    };
    const r = onCritEnemyChill([FROST, strong], true, true);
    expect(r!.mult).toBeCloseTo(0.6); // 40% 슬로우가 더 강함
  });

  it("전투 로그는 둔화량과 지속 턴을 쉽게 표시", () => {
    expect(formatChillSlowLog("허수아비", { mult: 0.75, turns: 2 })).toBe(
      "[한기] 허수아비이(가) 얼어붙어 느려진다. (속도 25% 감소, 2턴)",
    );
  });
});

describe("lowHpDamageReductionPct (성물 저체력 받피감)", () => {
  it("시그니처 없음/빈 배열 → 0 (골든 byte-identical 가드)", () => {
    expect(lowHpDamageReductionPct(undefined, 10, 100)).toBe(0);
    expect(lowHpDamageReductionPct([], 10, 100)).toBe(0);
  });

  it("HP 가 임계% 초과면 0 (조건 미충족)", () => {
    // 임계 30% → maxHp 100 의 30 = 30. HP 31 > 30 → 미발동.
    expect(lowHpDamageReductionPct([RELIC], 31, 100)).toBe(0);
  });

  it("HP 가 임계% 이하면 받피감 % 반환", () => {
    expect(lowHpDamageReductionPct([RELIC], 30, 100)).toBe(25); // 경계(=) 포함
    expect(lowHpDamageReductionPct([RELIC], 10, 100)).toBe(25);
  });

  it("low_hp 아닌 트리거는 무시", () => {
    const onCrit: SignatureEffect = {
      trigger: "on_crit",
      label: "군림",
      spdBuffPct: 20,
    };
    expect(lowHpDamageReductionPct([onCrit], 5, 100)).toBe(0);
  });

  it("여러 low_hp 시그니처는 합산(조건 충족분만)", () => {
    const other: SignatureEffect = {
      trigger: "low_hp",
      label: "기타",
      hpThresholdPct: 50,
      damageTakenReductionPct: 10,
    };
    // HP 25 → RELIC(≤30 ✓ +25) + other(≤50 ✓ +10) = 35.
    expect(lowHpDamageReductionPct([RELIC, other], 25, 100)).toBe(35);
    // HP 40 → RELIC(≤30 ✗) + other(≤50 ✓ +10) = 10.
    expect(lowHpDamageReductionPct([RELIC, other], 40, 100)).toBe(10);
  });

  it("maxHp 0 가드 → 0 (0 나눗셈 회피)", () => {
    expect(lowHpDamageReductionPct([RELIC], 0, 0)).toBe(0);
  });

  it("damageTakenReductionPct 없는 low_hp 는 무시", () => {
    const noPct: SignatureEffect = {
      trigger: "low_hp",
      label: "빈",
      hpThresholdPct: 30,
    };
    expect(lowHpDamageReductionPct([noPct], 5, 100)).toBe(0);
  });
});

describe("battleStartShield (검은 왕좌 전투 시작 보호막)", () => {
  it("시그니처 없음/다른 트리거/maxHp 0 → null", () => {
    expect(battleStartShield(undefined, 100)).toBeNull();
    expect(battleStartShield([RELIC], 100)).toBeNull();
    expect(battleStartShield([BLACK_THRONE], 0)).toBeNull();
  });

  it("maxHp 비율 보호막을 합산하고 라벨을 보존", () => {
    const other: SignatureEffect = {
      trigger: "battle_start",
      label: "성벽",
      battleStartShieldPctMaxHp: 8,
    };
    expect(battleStartShield([BLACK_THRONE, other], 200)).toEqual({
      amount: 40,
      label: "검은 왕좌 + 성벽",
    });
  });
});

describe("healToShield (묵주 회복 보호막 전환)", () => {
  it("시그니처 없음/다른 트리거/회복 0 → null", () => {
    expect(healToShield(undefined, 20)).toBeNull();
    expect(healToShield([RELIC], 20)).toBeNull();
    expect(healToShield([RELIQUARY], 0)).toBeNull();
  });

  it("실제 회복량 비율 보호막을 합산하고 라벨을 보존", () => {
    const other: SignatureEffect = {
      trigger: "on_heal",
      label: "성흔",
      healToShieldPct: 15,
    };
    expect(healToShield([RELIQUARY, other], 40)).toEqual({
      amount: 16,
      label: "묵주 + 성흔",
    });
  });
});

describe("onHitTakenDefGain (백왕좌 피격 방어 누적)", () => {
  it("시그니처 없음/다른 트리거 → null", () => {
    expect(onHitTakenDefGain(undefined)).toBeNull();
    expect(onHitTakenDefGain([])).toBeNull();
    expect(onHitTakenDefGain([RELIC])).toBeNull();
  });

  it("on_hit_taken defGainOnHitPct 를 합산하고 라벨을 보존", () => {
    const other: SignatureEffect = {
      trigger: "on_hit_taken",
      label: "흑철",
      defGainOnHitPct: 15,
    };
    expect(onHitTakenDefGain([BONE_THRONE, other])).toEqual({
      pct: 50,
      label: "백왕좌 + 흑철",
    });
  });
});

describe("statusBlockOnce (공허왕관 상태이상 1회 방어)", () => {
  it("시그니처 없음/다른 트리거 → null", () => {
    expect(statusBlockOnce(undefined)).toBeNull();
    expect(statusBlockOnce([])).toBeNull();
    expect(statusBlockOnce([CROWN])).toBeNull();
  });

  it("status_block_once 라벨을 보존", () => {
    expect(statusBlockOnce([VOID_CROWN])).toEqual({ label: "공허왕관" });
  });
});

describe("onSkillCastMpRefund (왕릉성 스킬 MP 환급)", () => {
  it("시그니처 없음/다른 트리거 → null", () => {
    expect(onSkillCastMpRefund(undefined)).toBeNull();
    expect(onSkillCastMpRefund([])).toBeNull();
    expect(onSkillCastMpRefund([CROWN])).toBeNull();
  });

  it("on_skill_cast mpRefundPctOfCost 를 합산하고 라벨을 보존", () => {
    const other: SignatureEffect = {
      trigger: "on_skill_cast",
      label: "순환",
      mpRefundPctOfCost: 10,
    };
    expect(onSkillCastMpRefund([CAIRN_STAR, other])).toEqual({
      pct: 35,
      label: "왕릉성 + 순환",
    });
  });
});

describe("onCritSpeedBuff (군림 크리 속도)", () => {
  it("크리 아님/피해 0/미장착 → null (게이트)", () => {
    expect(onCritSpeedBuff([CROWN], false, true)).toBeNull(); // 크리 아님
    expect(onCritSpeedBuff([CROWN], true, false)).toBeNull(); // 피해 0
    expect(onCritSpeedBuff(undefined, true, true)).toBeNull(); // 미장착
  });

  it("크리 + 피해 → {배수, 지속} (spdBuffPct 20 → 1.2 / 2행동)", () => {
    expect(onCritSpeedBuff([CROWN], true, true)).toEqual({ mult: 1.2, turns: 2 });
  });

  it("on_crit 아닌 트리거/spdBuffPct 없는 건 무시", () => {
    expect(onCritSpeedBuff([FANG], true, true)).toBeNull(); // 독니=poison만
    const lowHp: SignatureEffect = { trigger: "low_hp", label: "성물" };
    expect(onCritSpeedBuff([lowHp], true, true)).toBeNull();
  });

  it("여러 개면 가장 강한 배수", () => {
    const weaker: SignatureEffect = {
      trigger: "on_crit",
      label: "약",
      spdBuffPct: 10,
      buffActions: 5,
    };
    expect(onCritSpeedBuff([weaker, CROWN], true, true)).toEqual({
      mult: 1.2,
      turns: 2,
    });
  });
});

describe("firesOnCritPoison (독니 크리 독)", () => {
  it("크리 + 피해 + poisonOnCrit → true", () => {
    expect(firesOnCritPoison([FANG], true, true)).toBe(true);
  });
  it("게이트 미충족 → false", () => {
    expect(firesOnCritPoison([FANG], false, true)).toBe(false);
    expect(firesOnCritPoison([FANG], true, false)).toBe(false);
    expect(firesOnCritPoison(undefined, true, true)).toBe(false);
    expect(firesOnCritPoison([CROWN], true, true)).toBe(false); // 군림=속도만
  });
});

describe("rollOnHitPoison (공격 적중 시 확률 중독)", () => {
  it("피해 없음/미장착/확률 실패 → null", () => {
    expect(rollOnHitPoison([BLUE_VENOM], false, () => 0)).toBeNull();
    expect(rollOnHitPoison(undefined, true, () => 0)).toBeNull();
    expect(rollOnHitPoison([BLUE_VENOM], true, () => 0.99)).toBeNull();
  });

  it("확률 성공 시 스택과 라벨을 반환하고 여러 장비는 합산", () => {
    const other: SignatureEffect = {
      trigger: "on_hit",
      label: "맹독침",
      poisonChancePct: 100,
      poisonStacks: 2,
    };
    expect(rollOnHitPoison([BLUE_VENOM, other], true, () => 0)).toEqual({
      stacks: 3,
      label: "청독 + 맹독침",
    });
  });
});

describe("rollOnHitShock (공격 적중 시 감전 둔화)", () => {
  it("피해 없음/미장착/확률 실패 → null", () => {
    expect(rollOnHitShock([THUNDER_FANG], false, () => 0)).toBeNull();
    expect(rollOnHitShock(undefined, true, () => 0)).toBeNull();
    expect(rollOnHitShock([THUNDER_FANG], true, () => 0.99)).toBeNull();
  });

  it("확률 성공 시 슬로우 배수와 지속행동을 반환", () => {
    expect(rollOnHitShock([THUNDER_FANG], true, () => 0)).toEqual({
      mult: 0.5,
      turns: 1,
      label: "뇌운",
    });
  });

  it("여러 개면 가장 강한 슬로우를 사용하고 라벨은 보존", () => {
    const weaker: SignatureEffect = {
      trigger: "on_hit",
      label: "잔전",
      shockChancePct: 100,
      shockSlowPct: 20,
      buffActions: 3,
    };
    expect(rollOnHitShock([weaker, THUNDER_FANG], true, () => 0)).toEqual({
      mult: 0.5,
      turns: 1,
      label: "잔전 + 뇌운",
    });
  });

  it("전투 로그는 감전 라벨과 둔화량을 표시", () => {
    expect(formatShockSlowLog("허수아비", { mult: 0.5, turns: 1, label: "뇌운" })).toBe(
      "[뇌운] 허수아비이(가) 감전되어 움직임이 끊긴다. (속도 50% 감소, 1턴)",
    );
  });
});

describe("onDodgeHealAmount (봉인 회피 회복)", () => {
  const SEAL: SignatureEffect = {
    trigger: "on_dodge",
    label: "봉인",
    healPct: 8,
  };
  it("on_dodge healPct → maxHp 의 % 회복량(내림)", () => {
    expect(onDodgeHealAmount([SEAL], 100)).toBe(8); // 8% of 100
    expect(onDodgeHealAmount([SEAL], 250)).toBe(20); // floor(0.08*250)
  });
  it("미장착/다른 트리거/maxHp 0 → 0", () => {
    expect(onDodgeHealAmount(undefined, 100)).toBe(0);
    expect(onDodgeHealAmount([CROWN], 100)).toBe(0); // on_crit
    expect(onDodgeHealAmount([SEAL], 0)).toBe(0);
  });
});

describe("onDodgeSpeedBuff (독왕 회피 속도)", () => {
  const VENOM: SignatureEffect = {
    trigger: "on_dodge",
    label: "독왕",
    spdBuffPct: 25,
    buffActions: 3,
  };
  it("on_dodge spdBuffPct → {배수, 지속}", () => {
    expect(onDodgeSpeedBuff([VENOM])).toEqual({ mult: 1.25, turns: 3 });
  });
  it("미장착/회복전용(봉인)/on_crit → null", () => {
    expect(onDodgeSpeedBuff(undefined)).toBeNull();
    expect(
      onDodgeSpeedBuff([{ trigger: "on_dodge", label: "봉인", healPct: 8 }]),
    ).toBeNull(); // spdBuffPct 없음
    expect(onDodgeSpeedBuff([CROWN])).toBeNull(); // on_crit
  });
});

describe("everyNHitsValue (포식자 N타마다)", () => {
  const PRED: SignatureEffect = {
    trigger: "every_n_hits",
    label: "포식자",
    everyNHits: 3,
  };
  it("every_n_hits → N (가장 작은 N)", () => {
    expect(everyNHitsValue([PRED])).toBe(3);
    const faster: SignatureEffect = {
      trigger: "every_n_hits",
      label: "빠름",
      everyNHits: 2,
    };
    expect(everyNHitsValue([PRED, faster])).toBe(2); // 더 자주
  });
  it("미장착/다른 트리거/N<1 → 0", () => {
    expect(everyNHitsValue(undefined)).toBe(0);
    expect(everyNHitsValue([CROWN])).toBe(0); // on_crit
    expect(
      everyNHitsValue([{ trigger: "every_n_hits", label: "0", everyNHits: 0 }]),
    ).toBe(0);
  });
});

describe("엔진 통합 — 포식자 every-N 카운터가 적중 시 증가한다 (PvE)", () => {
  afterEach(() => vi.restoreAllMocks());
  function dummyPredator(equipSignatures?: SignatureEffect[]) {
    const base = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} }).player;
    return {
      ...base,
      hp: 60,
      maxHp: 60,
      attackCount: 1,
      ...(equipSignatures ? { equipSignatures } : {}),
    };
  }
  const PRED: SignatureEffect = {
    trigger: "every_n_hits",
    label: "포식자",
    everyNHits: 3,
  };

  it("포식자 장착 → finalState.stacks.signatureHitCount > 0 (적중마다 증가)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const res = resolveBattle(
      dummyPredator([PRED]),
      V2_MONSTERS["훈련용 허수아비"],
      "용사",
      {
        pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
        potions: {},
        v2Skills: emptyV2SkillsState(),
      },
    );
    expect(res.finalState.stacks.signatureHitCount).toBeGreaterThan(0);
  });

  it("대조군 — 미장착이면 signatureHitCount 0 유지(byte-identical 가드)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const res = resolveBattle(
      dummyPredator(),
      V2_MONSTERS["훈련용 허수아비"],
      "용사",
      {
        pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
        potions: {},
        v2Skills: emptyV2SkillsState(),
      },
    );
    expect(res.finalState.stacks.signatureHitCount).toBe(0);
  });
});

describe("엔진 통합 — battle_start 보호막이 전투 시작 시 적용된다 (PvE)", () => {
  it("검은 왕좌 장착 → initialBattleState 에 보호막과 로그가 생긴다", () => {
    const base = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} }).player;
    const player = {
      ...base,
      hp: 200,
      maxHp: 200,
      equipSignatures: [BLACK_THRONE],
    };
    const state = initialBattleState(
      player,
      V2_MONSTERS["훈련용 허수아비"],
      "용사",
    );
    expect(state.stacks.playerShield).toBe(24);
    expect(
      state.log.some(
        (e) => typeof e.text === "string" && e.text.includes("[검은 왕좌]"),
      ),
    ).toBe(true);
  });
});

describe("엔진 통합 — on-hit-taken 방어 누적이 피격 시 증가한다 (PvE)", () => {
  afterEach(() => vi.restoreAllMocks());

  function dummyDefender(equipSignatures?: SignatureEffect[]) {
    const base = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} }).player;
    return {
      ...base,
      hp: 200,
      maxHp: 200,
      atk: 1,
      def: 10,
      spd: 1,
      attackCount: 1,
      evasionPct: 0,
      evaRating: 0,
      guaranteedEvades: 0,
      ...(equipSignatures ? { equipSignatures } : {}),
    };
  }

  const hardHitter = {
    ...V2_MONSTERS["훈련용 허수아비"],
    hp: 999,
    atk: 80,
    def: 0,
    spd: 999,
  };

  it("백왕좌 장착 → 피격 후 braceDefBonus 와 로그가 생긴다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const res = resolveBattle(dummyDefender([BONE_THRONE]), hardHitter, "용사", {
      pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
      potions: {},
      v2Skills: emptyV2SkillsState(),
    });
    expect(res.finalState.stacks.braceDefBonus).toBeGreaterThan(0);
    expect(
      res.finalState.log.some(
        (e) => typeof e.text === "string" && e.text.includes("[백왕좌]"),
      ),
    ).toBe(true);
  });

  it("대조군 — 미장착이면 braceDefBonus 0 유지", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const res = resolveBattle(dummyDefender(), hardHitter, "용사", {
      pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
      potions: {},
      v2Skills: emptyV2SkillsState(),
    });
    expect(res.finalState.stacks.braceDefBonus).toBe(0);
  });
});

describe("엔진 통합 — on-skill-cast MP 환급이 스킬 시전 후 적용된다 (PvE)", () => {
  afterEach(() => vi.restoreAllMocks());

  function skillCaster(equipSignatures?: SignatureEffect[]) {
    const base = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} }).player;
    return {
      ...base,
      hp: 200,
      maxHp: 200,
      atk: 100,
      spd: 100,
      maxMp: 1000,
      mp: 1000,
      attackCount: 1,
      accuracyPct: 100,
      accRating: 100,
      ...(equipSignatures ? { equipSignatures } : {}),
    };
  }

  function runSkillRefund(equipSignatures?: SignatureEffect[]) {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    return resolveBattle(
      skillCaster(equipSignatures),
      { ...V2_MONSTERS["훈련용 허수아비"], hp: 50, def: 0, spd: 1 },
      "용사",
      {
        pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
        potions: {},
        v2Skills: {
          learned: ["v2_skill_strike"],
          equipped: ["v2_skill_strike"],
        },
      },
    ).finalState;
  }

  it("왕릉성 장착 → 같은 스킬 시전 후 MP 가 더 남고 환급 로그가 생긴다", () => {
    const plain = runSkillRefund();
    vi.restoreAllMocks();
    const refunded = runSkillRefund([CAIRN_STAR]);
    expect(refunded.playerMp).toBeGreaterThan(plain.playerMp);
    expect(
      refunded.log.some(
        (e) => typeof e.text === "string" && e.text.includes("[왕릉성]"),
      ),
    ).toBe(true);
  });
});

describe("엔진 통합 — on-heal 보호막 전환이 실제 회복 후 적용된다 (PvE)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("묵주 장착 + 회복 스킬 → 실제 회복량 일부가 보호막으로 전환된다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const base = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} }).player;
    const player = {
      ...base,
      hp: 50,
      maxHp: 200,
      maxMp: 1000,
      mp: 1000,
      equipSignatures: [RELIQUARY],
    };
    const state = initialBattleState(
      player,
      { ...V2_MONSTERS["훈련용 허수아비"], hp: 999, atk: 0, def: 0, spd: 1 },
      "용사",
      {
        learned: ["v2_skill_recover"],
        equipped: ["v2_skill_recover"],
      },
    );
    const result = applyPlayerV2SkillCast(state, player, {
      selfBuffs: {},
      selfDebuffs: {},
      enemyDebuffs: {},
    }).state;
    expect(result.playerHp).toBeGreaterThan(state.playerHp);
    expect(result.stacks.playerShield).toBeGreaterThan(0);
    expect(
      result.log.some(
        (e) => typeof e.text === "string" && e.text.includes("[묵주]"),
      ),
    ).toBe(true);
  });
});

describe("엔진 통합 — status_block_once 가 첫 한기 부여를 막는다 (PvE)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("공허왕관 장착 → 첫 한기 스택이 0으로 유지되고 플래그가 소모된다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const base = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} }).player;
    const player = {
      ...base,
      hp: 200,
      maxHp: 200,
      def: 100,
      evasionPct: 0,
      evaRating: 0,
      equipSignatures: [VOID_CROWN],
    };
    const enemy = {
      ...V2_MONSTERS["훈련용 허수아비"],
      hp: 999,
      atk: 10,
      def: 0,
      spd: 100,
      skill: {
        kind: "chill" as const,
        name: "선천의 한기",
        perHit: 2,
        dmgPerStack: 3,
        threshold: 4,
      },
    };
    const state = {
      ...initialBattleState(player, enemy, "용사"),
      phase: "enemy" as const,
    };
    const after = advanceTurn(state, player, "용사");
    expect(after.stacks.chillStacks).toBe(0);
    expect(after.flags.statusBlockUsed).toBe(true);
    expect(
      after.log.some(
        (e) => typeof e.text === "string" && e.text.includes("[공허왕관]"),
      ),
    ).toBe(true);
  });
});

describe("엔진 통합 — on-crit 독(독니)이 실제 적에게 부여된다 (PvE)", () => {
  afterEach(() => vi.restoreAllMocks());

  function dummyPlayer(equipSignatures?: SignatureEffect[]) {
    const base = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} }).player;
    // critChancePct 100 = 항상 크리, hp 낮춰 전투 종결 보장. 허수아비(atk4·hp50만)=탱.
    return {
      ...base,
      hp: 60,
      maxHp: 60,
      critChancePct: 100,
      attackCount: 1,
      ...(equipSignatures ? { equipSignatures } : {}),
    };
  }

  it("독니 시그니처 장착 + 크리 → finalState.enemyV2Dots 에 poison", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // 미스 회피·크리 강제(100%)
    const res = resolveBattle(
      dummyPlayer([FANG]),
      V2_MONSTERS["훈련용 허수아비"],
      "용사",
      {
        pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
        potions: {},
        v2Skills: emptyV2SkillsState(),
      },
    );
    expect(res.finalState.enemyV2Dots.some((d) => d.tag === "poison")).toBe(true);
  });

  it("대조군 — 시그니처 없으면 poison 없음(누수 가드)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const res = resolveBattle(
      dummyPlayer(), // 시그니처 미장착
      V2_MONSTERS["훈련용 허수아비"],
      "용사",
      {
        pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
        potions: {},
        v2Skills: emptyV2SkillsState(),
      },
    );
    expect(res.finalState.enemyV2Dots.some((d) => d.tag === "poison")).toBe(
      false,
    );
  });

  it("한기(동결의 갑주) 장착 + 크리 → 적 둔화 로그에 감소율 표시", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // 미스 회피·크리 강제(100%)
    const res = resolveBattle(
      dummyPlayer([FROST]),
      V2_MONSTERS["훈련용 허수아비"],
      "용사",
      {
        pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
        potions: {},
        v2Skills: emptyV2SkillsState(),
      },
    );
    const chillLog = res.finalState.log.find(
      (e) => typeof e.text === "string" && e.text.includes("[한기]"),
    )?.text;
    expect(chillLog).toContain("느려진다");
    expect(chillLog).toContain("속도 25% 감소");
    expect(chillLog).not.toContain("굼떠");
  });

  it("대조군 — 한기 미장착이면 둔화 로그 없음(누수 가드)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const res = resolveBattle(
      dummyPlayer(),
      V2_MONSTERS["훈련용 허수아비"],
      "용사",
      {
        pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
        potions: {},
        v2Skills: emptyV2SkillsState(),
      },
    );
    expect(
      res.finalState.log.some(
        (e) => typeof e.text === "string" && e.text.includes("[한기]"),
      ),
    ).toBe(false);
  });
});
