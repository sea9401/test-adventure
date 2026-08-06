import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  combatMatchupResult,
  CombatMatchupSummary,
} from "./CombatMatchupSummary";

describe("명중·회피 전투 예상", () => {
  const player = { accuracyRating: 23, evasionRating: 75 };
  const enemy = { accuracyRating: 8, evasionRating: 0 };

  it("PvE는 완화된 계수로 최종 회피·적중 확률을 계산한다", () => {
    const result = combatMatchupResult(player, enemy);

    expect(result.playerDodgePct).toBeCloseTo(45.7317, 3);
    expect(result.enemyHitPct).toBeCloseTo(54.2683, 3);
    expect(result.playerDodgePct + result.enemyHitPct).toBe(100);
  });

  it("PvP는 조정된 명중 대결 계수 7로 계산한다", () => {
    const result = combatMatchupResult(player, enemy, "pvp");

    expect(result.playerDodgePct).toBeCloseTo(42.9389, 3);
    expect(result.enemyHitPct).toBeCloseTo(57.0611, 3);
  });

  it("PvP 전용 계수는 양쪽 공격에 적용하고 PvE 플레이어 명중 계수 8은 유지한다", () => {
    const attacker = { accuracyRating: 8, evasionRating: 0 };
    const defender = { accuracyRating: 0, evasionRating: 75 };

    expect(combatMatchupResult(attacker, defender, "pvp").playerHitPct)
      .toBeCloseTo(55.0611, 3);
    expect(combatMatchupResult(attacker, defender, "pve").playerHitPct)
      .toBeCloseTo(57.5324, 3);
  });

  it("원본 능력과 최종 확률을 다른 이름으로 함께 표시한다", () => {
    const html = renderToStaticMarkup(
      <CombatMatchupSummary player={player} enemy={enemy} />,
    );

    expect(html).toContain("내 회피율");
    expect(html).toContain("46%");
    expect(html).toContain("적 적중률 54%");
    expect(html).toContain("내 회피 능력 75");
    expect(html).toContain("적 명중 능력 8");
    expect(html).toContain("능력 수치는 확률이 아니며");
  });
});
