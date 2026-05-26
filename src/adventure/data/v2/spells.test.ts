import { describe, it, expect } from "vitest";
import {
  SPELLS,
  SPELL_LEARN_THRESHOLD,
  applyStartOfBattleSpells,
  learnedSpellsForInt,
  normalizeEquippedSpells,
} from "./spells";
import type { BattleState } from "@/adventure/battle/engine";

function mkState(over: Partial<BattleState> = {}): BattleState {
  return {
    enemy: { name: "허수아비", tags: [], hp: 100, atk: 1, def: 0, spd: 1, exp: 0 },
    enemyHp: 1000,
    playerHp: 100,
    playerMaxHp: 100,
    playerMp: 100,
    playerMaxMp: 100,
    log: [],
    phase: "player",
    outcome: null,
    playerAttacksLeft: 1,
    turn: {} as BattleState["turn"],
    flags: {} as BattleState["flags"],
    buffs: {} as BattleState["buffs"],
    stacks: {} as BattleState["stacks"],
    ap: 0,
    ...over,
  };
}

describe("v2 spells — applyStartOfBattleSpells", () => {
  it("INT 0 은 발동 X (라이브 캐릭)", () => {
    const before = mkState();
    const after = applyStartOfBattleSpells(before, 0, ["meteor", "bolt", "flame"], "용사");
    expect(after).toBe(before);
  });

  it("maxMp 0 은 발동 X", () => {
    const before = mkState({ playerMp: 0, playerMaxMp: 0 });
    const after = applyStartOfBattleSpells(before, 10, ["meteor", "bolt", "flame"], "용사");
    expect(after).toBe(before);
  });

  it("INT 10, MP 100 → 유성(80) + 불꽃(20) 발동", () => {
    const before = mkState({ playerMp: 100, playerMaxMp: 100 });
    const after = applyStartOfBattleSpells(before, 10, ["meteor", "bolt", "flame"], "용사");
    // 유성 = INT 10 × 12 = 120, 불꽃 = INT 10 × 3 = 30 → 총 150
    expect(before.enemyHp - after.enemyHp).toBe(150);
    expect(after.playerMp).toBe(0);
    const spellLogs = after.log.filter((e) => e.text?.includes("[유성]") || e.text?.includes("[불꽃]"));
    expect(spellLogs.length).toBe(2);
  });

  it("적이 마법으로 죽으면 sweep 중단", () => {
    const before = mkState({ enemyHp: 50, playerMp: 100, playerMaxMp: 100 });
    const after = applyStartOfBattleSpells(before, 10, ["meteor", "bolt", "flame"], "용사");
    // 유성 120 → 적 -70 → 죽음. 불꽃 안 나감.
    expect(after.enemyHp).toBe(0);
    expect(after.playerMp).toBe(20); // 유성 80 만 차감
  });

  it("MP 부족하면 큰 비용 마법 건너뜀", () => {
    const before = mkState({ playerMp: 50, playerMaxMp: 50 });
    const after = applyStartOfBattleSpells(before, 10, ["meteor", "bolt", "flame"], "용사");
    // 유성 80 > 50 → 스킵, 번개 40 = INT 60, 불꽃 20 → MP 10 남음
    expect(after.playerMp).toBeLessThanOrEqual(20);
    expect(before.enemyHp - after.enemyHp).toBeGreaterThan(0);
  });
});

describe("v2 spells — equippedSpells 필터", () => {
  it("장착 안 한 마법은 발동 X", () => {
    function mkS() { return mkState({ playerMp: 100, playerMaxMp: 100 }); }
    const before = mkS();
    const after = applyStartOfBattleSpells(before, 10, ["flame"], "용사");
    // 불꽃만 발동 (INT 10 × 3 = 30, MP 20 → 5번 발동 가능: 5×20=100)
    expect(before.enemyHp - after.enemyHp).toBe(150); // 5 발 × 30
    expect(after.playerMp).toBe(0);
  });

  it("빈 배열이면 발동 X", () => {
    const before = mkState({ playerMp: 100, playerMaxMp: 100 });
    const after = applyStartOfBattleSpells(before, 10, [], "용사");
    expect(after).toBe(before);
  });
});

describe("v2 spells — learnedSpellsForInt", () => {
  it("INT 임계 — flame=5, bolt=15, meteor=30", () => {
    expect(SPELL_LEARN_THRESHOLD).toEqual({ flame: 5, bolt: 15, meteor: 30 });
    expect(learnedSpellsForInt(0)).toEqual([]);
    expect(learnedSpellsForInt(5)).toEqual(["flame"]);
    expect(learnedSpellsForInt(14)).toEqual(["flame"]);
    expect(learnedSpellsForInt(15)).toEqual(["bolt", "flame"]);
    expect(learnedSpellsForInt(30)).toEqual(["meteor", "bolt", "flame"]);
  });
});

describe("v2 spells — normalizeEquippedSpells", () => {
  it("학습 안 한 / 중복 / 알 수 없는 id 제거 + 슬롯 cap", () => {
    expect(
      normalizeEquippedSpells(["meteor", "bolt", "flame"], 10, 3),
    ).toEqual(["flame"]); // INT 10 은 flame 만 학습
    expect(
      normalizeEquippedSpells(["bolt", "flame", "flame", "junk"], 15, 3),
    ).toEqual(["bolt", "flame"]);
    expect(
      normalizeEquippedSpells(["meteor", "bolt", "flame"], 30, 2),
    ).toEqual(["meteor", "bolt"]);
    expect(normalizeEquippedSpells("not-array", 30, 3)).toEqual([]);
  });
});

describe("v2 spells — SPELLS 카탈로그", () => {
  it("3종 모두 정의 (flame/bolt/meteor)", () => {
    expect(Object.keys(SPELLS).sort()).toEqual(["bolt", "flame", "meteor"]);
  });

  it("비용·데미지 비율이 단조 (큰 비용 = 큰 데미지)", () => {
    expect(SPELLS.flame.mpCost).toBeLessThan(SPELLS.bolt.mpCost);
    expect(SPELLS.bolt.mpCost).toBeLessThan(SPELLS.meteor.mpCost);
    expect(SPELLS.flame.intMultiplier).toBeLessThan(SPELLS.bolt.intMultiplier);
    expect(SPELLS.bolt.intMultiplier).toBeLessThan(SPELLS.meteor.intMultiplier);
  });
});
