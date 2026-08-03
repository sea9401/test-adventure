import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MonsterHuntCodexCard } from "./V2QuestView";

describe("몬스터 처치 현황 카드", () => {
  it("기본 필터에서 미처치 몬스터와 과거 기록 안내를 보여준다", () => {
    const html = renderToStaticMarkup(
      <MonsterHuntCodexCard
        codex={{
          huntableSpecies: 2,
          currentKilled: 1,
          recordedSpecies: 3,
          legacyKilled: 2,
          entries: [
            {
              name: "들개",
              areas: ["들판"],
              firstDepth: 1,
              defeated: true,
              kills: 2,
            },
            {
              name: "모래도마뱀",
              areas: ["마른 협곡"],
              firstDepth: 7,
              defeated: false,
              kills: 0,
            },
          ],
        }}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain("몬스터 처치 현황");
    expect(html).toContain("과거 처치 기록 2종");
    expect(html).toContain("미처치 1종");
    expect(html).toContain("모래도마뱀");
    expect(html).not.toContain(">들개<");
  });
});
