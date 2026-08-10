import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn() }),
}));

import { V2BattleLogHandoffView } from "./V2BattleLogHandoffView";

describe("전투 로그 재진입 화면", () => {
  it("소프트 이동에서는 기존 결과 위에 불투명한 전체 화면으로 열린다", () => {
    const props = {
      handoffId: "handoff-1",
      presentation: "overlay" as const,
    };

    const html = renderToStaticMarkup(
      <V2BattleLogHandoffView {...props} />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('data-battle-log-scroll-container="true"');
    expect(html).toContain("fixed inset-0");
    expect(html).toContain("bg-white");
    expect(html).toContain("dark:bg-zinc-950");
  });
});
