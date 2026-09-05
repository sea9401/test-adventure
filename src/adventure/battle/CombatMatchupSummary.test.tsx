import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  combatMatchupResult,
  CombatMatchupSummary,
} from "./CombatMatchupSummary";

describe("적중·회피 경감 전투 예상", () => {
  const player = { accuracyRating: 23, evasionRating: 75 };
  const enemy = { accuracyRating: 8, evasionRating: 0 };

  it("PvE는 계수 2.5로 직접 피해 경감률을 계산한다", () => {
    const result = combatMatchupResult(player, enemy);

    expect(result.playerEvasionReductionPct).toBeCloseTo(67.1053, 3);
    expect(result.playerDamageRetainedPct).toBe(100);
  });

  it("PvP는 적중 대응 계수 3으로 계산한다", () => {
    const result = combatMatchupResult(player, enemy, "pvp");

    expect(result.playerEvasionReductionPct).toBeCloseTo(64.3939, 3);
  });

  it("PvP 전용 계수는 양쪽 공격에 적용한다", () => {
    const attacker = { accuracyRating: 8, evasionRating: 0 };
    const defender = { accuracyRating: 0, evasionRating: 75 };

    expect(
      combatMatchupResult(attacker, defender, "pvp").playerDamageRetainedPct,
    ).toBeCloseTo(35.6061, 3);
    expect(
      combatMatchupResult(attacker, defender, "pve").playerDamageRetainedPct,
    ).toBeCloseTo(32.8947, 3);
  });

  it("PvP 물리 방어 예상은 PvE 점감식이 아닌 공격력-방어력 판정을 사용한다", () => {
    const result = combatMatchupResult(
      {
        accuracyRating: 0,
        evasionRating: 0,
        physicalDefense: 500,
      },
      {
        accuracyRating: 0,
        evasionRating: 0,
        incomingAttack: 1_000,
        incomingAttackType: "physical",
      },
      "pvp",
    );

    expect(result.playerDefenseReductionPct).toBe(50);
    expect(result.playerDirectDamageRetainedPct).toBe(50);
  });

  it("PvE 마법 방어 예상은 공격력이 아니라 적 마법 관통도와 대결한다", () => {
    const defender = {
      accuracyRating: 0,
      evasionRating: 0,
      magicDefense: 500,
    };
    const lowAttack = combatMatchupResult(defender, {
      accuracyRating: 0,
      evasionRating: 0,
      incomingAttack: 1_000,
      incomingAttackType: "magic",
      magicPenetration: 500,
    });
    const highAttack = combatMatchupResult(defender, {
      accuracyRating: 0,
      evasionRating: 0,
      incomingAttack: 100_000,
      incomingAttackType: "magic",
      magicPenetration: 500,
    });
    const highPenetration = combatMatchupResult(defender, {
      accuracyRating: 0,
      evasionRating: 0,
      incomingAttack: 1_000,
      incomingAttackType: "magic",
      magicPenetration: 900,
    });

    expect(lowAttack.playerDefenseReductionPct).toBeCloseTo(42.5, 5);
    expect(highAttack.playerDefenseReductionPct).toBeCloseTo(42.5, 5);
    expect(highPenetration.playerDefenseReductionPct).toBeLessThan(
      lowAttack.playerDefenseReductionPct,
    );
  });

  it("PvP 마법 방어 예상은 기존 공격력-방어력 판정을 유지한다", () => {
    const result = combatMatchupResult(
      {
        accuracyRating: 0,
        evasionRating: 0,
        magicDefense: 500,
      },
      {
        accuracyRating: 0,
        evasionRating: 0,
        incomingAttack: 1_000,
        incomingAttackType: "magic",
        magicPenetration: 900,
      },
      "pvp",
    );

    expect(result.playerDefenseReductionPct).toBe(50);
    expect(result.playerDirectDamageRetainedPct).toBe(50);
  });

  it("원본 수치와 최종 경감률을 구분해 표시한다", () => {
    const html = renderToStaticMarkup(
      <CombatMatchupSummary player={player} enemy={enemy} />,
    );

    expect(html).toContain("내 회피 경감률");
    expect(html).toContain("67%");
    expect(html).toContain("내 회피도 75");
    expect(html).toContain("적 적중도 8");
    expect(html).toContain("완전 회피는 별도");
  });

  it("방어·회피·마나 실드를 합친 현재 상대 직접 피해 예상치를 표시한다", () => {
    const result = combatMatchupResult(
      {
        ...player,
        physicalDefense: 500,
        magicBarrierAbsorbPct: 20,
        magicBarrierEfficiencyPct: 20,
        magicBarrierDurability: 100,
      },
      { ...enemy, incomingAttack: 1_000, incomingAttackType: "physical" },
    );
    expect(result.playerDefenseReductionPct).toBeCloseTo(42.5, 3);
    expect(result.playerBarrierAbsorbPct).toBe(20);
    expect(result.playerDirectDamageRetainedPct).toBeCloseTo(22.63, 2);

    const html = renderToStaticMarkup(
      <CombatMatchupSummary
        player={{
          ...player,
          physicalDefense: 500,
          magicBarrierAbsorbPct: 20,
          magicBarrierEfficiencyPct: 20,
          magicBarrierDurability: 100,
        }}
        enemy={{
          ...enemy,
          incomingAttack: 1_000,
          incomingAttackType: "physical",
        }}
      />,
    );
    expect(html).toContain("내 최종 직접 피해");
    expect(html).toContain("23% 받음");
    expect(html).toContain("물리 방어");
    expect(html).toContain("방어 전 피해에서 20% 분리");
    expect(html).toContain("몸통 피해에 방어·회피 적용");
  });

  it("새 효율 필드가 없는 옛 전투 데이터도 NaN 없이 표시한다", () => {
    const html = renderToStaticMarkup(
      <CombatMatchupSummary
        player={{
          ...player,
          physicalDefense: 500,
          magicBarrierAbsorbPct: 20,
          magicBarrierDurability: 100,
        }}
        enemy={{ ...enemy, incomingAttack: 1_000 }}
      />,
    );

    expect(html).not.toContain("NaN");
    expect(html).toContain("방어 전 피해에서 20% 분리");
    expect(html).not.toContain("지속 피해 보정");
  });

  it("중독 변동 원인인 최대 HP 성분 배율과 상태 피해 경감을 따로 표시한다", () => {
    const html = renderToStaticMarkup(
      <CombatMatchupSummary
        player={player}
        enemy={{
          ...enemy,
          maxHpDamageMult: 0.8,
          statusDamageReductionPct: 25,
        }}
      />,
    );

    expect(html).toContain("지속 피해 보정");
    expect(html).toContain("최대 HP 비례 성분 80%");
    expect(html).toContain("상태 피해 25% 경감");
  });
});
