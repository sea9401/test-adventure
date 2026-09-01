import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImmortalBerserkerStatus } from "./ImmortalBerserkerStatus";

const secondLife = {
  immortalLifeIndex: 1 as const,
  immortalLifeHp: 2_000_000,
  immortalLifeMaxHp: 3_564_000,
  immortalRegenActionsRemaining: 2,
  immortalRegenUsesRemaining: 1 as const,
  immortalNextRegenAmount: 106_920,
  immortalAtkMult: 1.12,
  immortalSpdMult: 1.06,
};

describe("ImmortalBerserkerStatus", () => {
  it("상세 카드에 현재 생명·재생·광폭을 모두 표시한다", () => {
    const html = renderToStaticMarkup(
      <ImmortalBerserkerStatus status={secondLife} />,
    );

    expect(html).toContain("생명 2 / 3");
    expect(html).toContain("현재 생명 2,000,000 / 3,564,000");
    expect(html).toContain("재생까지 2행동");
    expect(html).toContain("남은 재생 1회");
    expect(html).toContain("다음 재생 +106,920");
    expect(html).toContain("공격력 +12%");
    expect(html).toContain("행동 속도 +6%");
    expect(html).toContain('aria-label="현재 생명 단계"');
  });

  it("목록 압축 카드는 생명과 광폭만 표시한다", () => {
    const html = renderToStaticMarkup(
      <ImmortalBerserkerStatus status={secondLife} compact />,
    );

    expect(html).toContain("생명 2 / 3");
    expect(html).toContain("공격력 +12%");
    expect(html).not.toContain("재생까지");
    expect(html).not.toContain("남은 재생");
  });
});
