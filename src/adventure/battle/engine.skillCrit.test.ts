import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveBattle, type PlayerCombat } from "../v2/combat/engine";
import { pickAutoAction } from "../v2/combat/pickAutoAction";
import { emptyV2SkillsState } from "../data/v2/v2Skills";
import { SKILL_CRIT_MULT } from "../data/v2/v2CombatConstants";
import type { Monster } from "../data/monsters";

// 스킬(액티브) 치명타 — 평타와 같은 크리 확률(min(critChancePct, 75%))을 공유하되, 곱해지는 배수는
//   평타 critMult 와 분리한 별도 고정 다이얼(SKILL_CRIT_MULT). resolveBattle 의 스킬 데미지 적용부에만
//   존재(advanceTurn 은 스킬 캐스팅 안 함). PvE/PvP 미러는 골든 마스터(combatGolden.test) 가 커버.

// 마력 탄막(v2c_mage_barrage) — 순수 3타 마법 데미지(DoT 없음) → 크리 배수 검증에 깔끔.
const BARRAGE = "v2c_mage_barrage";
const skills = {
  ...emptyV2SkillsState(),
  learned: [BARRAGE],
  equipped: [BARRAGE],
  // 조건 없이 매 턴 탄막 강제 발동(스킬 캐스트 경로 결정론화).
  pattern: {
    blocks: [{ condition: { kind: "always" }, action: { kind: "skill", skillId: BARRAGE } }],
  },
} as ReturnType<typeof emptyV2SkillsState>;

const MAGE: PlayerCombat = {
  hp: 5000,
  maxHp: 5000,
  atk: 1, // 평타는 무의미하게(스킬 데미지만 보도록)
  magicAtk: 300,
  def: 5,
  spd: 100, // 플레이어 선공
  accuracyPct: 100, // 빗나감 0 (스킬 미스 롤 비활성)
  evasionPct: 0,
  attackCount: 1,
  maxMp: 100000, // MP 무제한(매 턴 탄막)
};

function dummy(hp: number): Monster {
  return { name: "더미", tags: ["beast"], hp, atk: 1, def: 0, spd: 1, exp: 1 };
}

// Math.random 을 0 으로 고정 → 두 런이 완전히 동일한 RNG 스트림. critChancePct 만 다르게 두면
//   유일한 차이가 "스킬 크리 발동 여부"라 그 효과를 순수 분리 측정할 수 있다.
function battle(critChancePct: number, enemyHp = 3000) {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const r = resolveBattle(
    { ...MAGE, critChancePct, hp: MAGE.maxHp },
    dummy(enemyHp),
    "마법사",
    {
      pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
      potions: {},
      v2Skills: skills,
    },
  );
  const barrageHits = r.finalState.log.filter(
    (l) => l.kind === "player_attack" && l.text.includes("마력 탄막"),
  );
  const firstCast = barrageHits.slice(0, 3);
  const firstCastDamage = firstCast.reduce(
    (sum, l) => sum + Number(l.text.match(/(\d+) 피해/)?.[1] ?? 0),
    0,
  );
  return {
    turns: r.turns,
    outcome: r.outcome,
    firstCastTexts: firstCast.map((l) => l.text),
    firstCastDamage,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("스킬 치명타 (SKILL_CRIT_MULT)", () => {
  it("크리 발동 시 스킬 데미지 ×SKILL_CRIT_MULT (평타 critMult 비연동)", () => {
    const noCrit = battle(0); // 크리 확률 0 → 발동 안 함(게이트)
    const crit = battle(100); // 캡 75% < mock(0) → 매 캐스트 크리
    expect(noCrit.firstCastDamage).toBeGreaterThan(0);
    expect(crit.firstCastDamage).toBe(
      Math.floor(noCrit.firstCastDamage * SKILL_CRIT_MULT),
    );
  });

  it("크리 발동 시 로그에 [크리티컬] 표기", () => {
    const crit = battle(100);
    expect(crit.firstCastTexts.every((t) => t.includes("[크리티컬]"))).toBe(true);
    const noCrit = battle(0);
    expect(noCrit.firstCastTexts.some((t) => t.includes("[크리티컬]"))).toBe(false);
  });

  it("크리 확률 0 이면 스킬 크리 미발동 (mock 0 이어도)", () => {
    // critChancePct 0 → (player.critChancePct ?? 0) > 0 게이트에서 차단.
    const noCrit = battle(0);
    expect(noCrit.firstCastTexts.some((t) => t.includes("[크리티컬]"))).toBe(false);
  });

  it("크리 빌드가 더 빨리 처치 (같은 RNG, 크리 확률만 차이)", () => {
    expect(battle(100).turns).toBeLessThan(battle(0).turns);
  });
});
