import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InvincibleFortressStatus } from "./InvincibleFortressStatus";

describe("InvincibleFortressStatus", () => {
  it("진행 중인 방벽의 시간·피해·예상 광폭을 표시한다", () => {
    const html = renderToStaticMarkup(
      <InvincibleFortressStatus status={{
        fortressBarrierActive: true,
        fortressBarrierTicksRemaining: 160,
        fortressBarrierDamage: 100_000,
        fortressBarrierTarget: 1_500_000,
        fortressEnrageTier: 2,
        fortressProjectedEnrageTier: 7,
        fortressCompletedBarrierCount: 1,
        fortressNextBarrierHpFraction: 0.5,
        fortressLastResultTier: 2,
      }} />,
    );

    expect(html).toContain("마력 방벽 2/4");
    expect(html).toContain("방벽 시험 240 / 400틱");
    expect(html).toContain("누적 피해 100,000 / 1,500,000");
    expect(html).toContain("예상 광폭: 7단계");
    expect(html).toContain('aria-valuenow="100000"');
  });

  it("방벽 밖에서는 현재 광폭의 공격·속도 증가량을 표시한다", () => {
    const html = renderToStaticMarkup(
      <InvincibleFortressStatus status={{
        fortressBarrierActive: false,
        fortressBarrierTicksRemaining: 0,
        fortressBarrierDamage: 0,
        fortressBarrierTarget: 1_500_000,
        fortressEnrageTier: 7,
        fortressProjectedEnrageTier: 7,
        fortressCompletedBarrierCount: 2,
        fortressNextBarrierHpFraction: 0.5,
        fortressLastResultTier: 7,
      }} />,
    );

    expect(html).toContain("현재 광폭: 7단계");
    expect(html).toContain("공격 +150% · 속도 +200%");
  });
});
