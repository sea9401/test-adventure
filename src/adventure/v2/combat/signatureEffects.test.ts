import { describe, it, expect, vi, afterEach } from "vitest";
import {
  lowHpDamageReductionPct,
  onCritSpeedBuff,
  firesOnCritPoison,
} from "./signatureEffects";
import { resolveBattle } from "./engine";
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
});
