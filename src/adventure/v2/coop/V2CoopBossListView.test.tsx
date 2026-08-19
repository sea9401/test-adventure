import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/v2/coop/useCoopBossState", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/adventure/v2/coop/useCoopBossState")
  >();
  return {
    ...actual,
    useCoopListState: () => ({
      scrolls: 99,
      sessions: [],
      claimables: [],
      busy: false,
      loaded: true,
      notice: null,
      lastReward: null,
      refresh: vi.fn(async () => undefined),
      summon: vi.fn(async () => null),
      claim: vi.fn(async () => undefined),
    }),
  };
});

import { V2CoopBossListView } from "./V2CoopBossListView";

describe("협동 보스 소환 난이도 선택", () => {
  it("산군·스콜피온·호수 괴물을 각각 한 카드의 NORMAL/HARD 선택지로 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2CoopBossListView onOpenSession={() => {}} onBack={() => {}} />,
    );

    expect(html.match(/>NORMAL<\/button>/g)).toHaveLength(3);
    expect(html.match(/>HARD<\/button>/g)).toHaveLength(3);
    expect(html).not.toContain("재앙의 스콜피온 킹</span>");
    expect(html).not.toContain("혹한의 호수 괴물</span>");
  });
});
