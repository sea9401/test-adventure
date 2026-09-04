// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const back = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back }),
}));

import { V2BattleLogHandoffView } from "./V2BattleLogHandoffView";
import { writeBattleLogHandoff } from "./battleLogHandoff";

afterEach(() => {
  cleanup();
  back.mockClear();
});

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

  it("로그 본문 아래 닫기 버튼으로 이전 화면에 돌아간다", () => {
    writeBattleLogHandoff(
      {
        kind: "text",
        title: "전투 결과",
        playerName: "모험가",
        enemyName: "훈련용 허수아비",
        lines: ["모험가의 공격!"],
      },
      { id: "handoff-1", storage: null },
    );
    render(
      <V2BattleLogHandoffView handoffId="handoff-1" presentation="overlay" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "전투 로그 닫기" }));

    expect(back).toHaveBeenCalledTimes(1);
  });
});
