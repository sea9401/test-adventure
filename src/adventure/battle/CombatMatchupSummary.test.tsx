import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  combatMatchupResult,
  CombatMatchupSummary,
} from "./CombatMatchupSummary";

describe("명중·회피 전투 예상", () => {
  const player = { accuracyRating: 23, evasionRating: 75 };
  const enemy = { accuracyRating: 8, evasionRating: 0 };

  it("회피 능력과 적 명중 능력을 최종 회피·적중 확률로 계산한다", () => {
    const result = combatMatchupResult(player, enemy);

    expect(result.playerDodgePct).toBeCloseTo(40.4676, 3);
    expect(result.enemyHitPct).toBeCloseTo(59.5324, 3);
    expect(result.playerDodgePct + result.enemyHitPct).toBe(100);
  });

  it("원본 능력과 최종 확률을 다른 이름으로 함께 표시한다", () => {
    const html = renderToStaticMarkup(
      <CombatMatchupSummary player={player} enemy={enemy} />,
    );

    expect(html).toContain("내 회피율");
    expect(html).toContain("40%");
    expect(html).toContain("적 적중률 60%");
    expect(html).toContain("내 회피 능력 75");
    expect(html).toContain("적 명중 능력 8");
    expect(html).toContain("능력 수치는 확률이 아니며");
  });
});
