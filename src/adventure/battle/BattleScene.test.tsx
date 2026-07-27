import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  actionFrequencyLabel,
  BattleCombatSummaryPanel,
} from "./BattleScene";

describe("전투 분석 표시", () => {
  it("속도를 적 1회당 내 행동 횟수로 바꿔 보여준다", () => {
    expect(actionFrequencyLabel(100, 50)).toMatch(/^적 1회당 내 \d+\.\d회$/);
  });

  it("행동·스킬·봉쇄·낭비 회복을 한눈에 요약한다", () => {
    const html = renderToStaticMarkup(
      <BattleCombatSummaryPanel
        summary={{
          elapsedTicks: 1_500,
          tickCap: 3_000,
          playerActions: 20,
          enemyActions: 9,
          basicAttackActions: 12,
          potionActions: 0,
          skillUses: { 봉마진: 2, 화염구: 6 },
          damageDealt: 9_500,
          damageTaken: 1_200,
          healingDone: 800,
          healingWasted: 350,
          controlledEnemyActions: 7,
        }}
      />,
    );

    expect(html).toContain("전투 분석");
    expect(html).toContain("1,500 / 3,000틱 · 50%");
    expect(html).toContain("내 행동 <strong>20회</strong>");
    expect(html).toContain("봉쇄 적용 <strong>7/9회</strong>");
    expect(html).toContain("회복 낭비 <strong>350</strong>");
    expect(html).toContain("봉마진 2회");
  });
});
