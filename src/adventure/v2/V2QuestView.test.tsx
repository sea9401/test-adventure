import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  claimAllRewardText,
  MonsterHuntCodexCard,
  QuestRow,
} from "./V2QuestView";

describe("업적 메인 추적", () => {
  const quest = {
    id: "gold_100k",
    line: "collection" as const,
    title: "두둑한 지갑",
    desc: "총 보유 골드 100,000 G를 달성하세요.",
    href: null,
    reward: {},
    status: "active" as const,
    points: 20,
    progress: 42_000,
    goal: 100_000,
    detailKind: null,
  };

  it("진행 중 업적에 메인 표시 버튼과 추적 상태를 보여준다", () => {
    const available = renderToStaticMarkup(
      <QuestRow
        quest={quest}
        busy={false}
        onClaim={vi.fn()}
        onToggleTracking={vi.fn()}
      />,
    );
    expect(available).toContain("메인 표시");

    const tracked = renderToStaticMarkup(
      <QuestRow
        quest={quest}
        busy={false}
        onClaim={vi.fn()}
        tracked
        onToggleTracking={vi.fn()}
      />,
    );
    expect(tracked).toContain("메인 추적 중");
    expect(tracked).toContain("추적 해제");
  });
});

describe("업적 일괄 수령 보상 안내", () => {
  it("여러 장비와 칭호를 개수로 뭉개지 않고 실제 이름과 수량으로 보여준다", () => {
    expect(
      claimAllRewardText({
        gold: 1_200,
        equipment: ["v2_chain_mail", "v2_chain_mail"],
        staminaPotions: 3,
        titleIds: ["ach_full_gear", "first_blood"],
      }),
    ).toBe(
      "1,200 골드(은행 입금) · 장비: 쇠사슬 갑옷 ×2 · 스태미나 회복약 3개 · 칭호: 준비된 모험가, 초보 사냥꾼",
    );
  });
});

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
