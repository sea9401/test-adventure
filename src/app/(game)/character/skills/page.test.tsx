import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/adventure/v2/V2SkillLearnView", () => ({
  V2SkillLearnView: ({ section }: { section: string }) => (
    <div>스킬 화면: {section}</div>
  ),
}));

vi.mock("@/adventure/v2/V2CombatPatternView", () => ({
  V2CombatPatternView: () => <div>스킬 패턴</div>,
}));

import SkillsPage from "./page";

describe("스킬 허브 탭 프레임", () => {
  it("탭과 무관한 고정 외곽 프레임 안에서 읽기 폭 내용을 전환한다", () => {
    const html = renderToStaticMarkup(<SkillsPage />);

    expect(html).toContain('data-skill-content-frame="true"');
    expect(html).toContain('data-skill-readable-frame="true"');
    expect(html).toContain("ui-tab-content-reveal");
    expect(html).toContain("max-w-[720px]");
  });
});
