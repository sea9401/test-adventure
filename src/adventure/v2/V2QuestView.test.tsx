import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  claimAllRewardText,
  GuideEmptyState,
  MonsterHuntCodexCard,
  QuestTabContent,
  QuestTopTabs,
  QuestRow,
} from "./V2QuestView";

describe("퀘스트 탭 전환 경계", () => {
  it("진행 항목을 모두 마치면 자체 축하 아이콘을 표시한다", () => {
    const html = renderToStaticMarkup(
      <GuideEmptyState tab="active" groupLabel="업적" />,
    );

    expect(html).toContain('data-plump-icon="celebration"');
    expect(html).toContain("진행 중인 업적 항목이 없어요.");
    expect(html).not.toContain("🎉");
  });

  it("선택 탭을 독립 DOM 경계와 위치 이동 없는 전환으로 감싼다", () => {
    const html = renderToStaticMarkup(
      <QuestTabContent tab="weekly">
        <p>주간 내용</p>
      </QuestTabContent>,
    );

    expect(html).toContain('data-quest-tab-content="weekly"');
    expect(html).toContain("ui-tab-content-reveal");
    expect(html).toContain("주간 내용");
  });
});

describe("일일·주간 퀘스트 보상 탭 알림", () => {
  it("업적 탭을 보고 있어도 받을 수 있는 일일·주간 보상을 표시한다", () => {
    const html = renderToStaticMarkup(
      <QuestTopTabs
        active="achievement"
        dailyRewardReady
        weeklyRewardReady
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="일일 보상 수령 가능"');
    expect(html).toContain('aria-label="주간 보상 수령 가능"');
    expect(html.match(/>받기<\/span>/g)).toHaveLength(2);
  });

  it("받을 반복 보상이 없으면 일일·주간 탭 배지를 숨긴다", () => {
    const html = renderToStaticMarkup(
      <QuestTopTabs
        active="daily"
        dailyRewardReady={false}
        weeklyRewardReady={false}
        onChange={vi.fn()}
      />,
    );

    expect(html).not.toContain("보상 수령 가능");
    expect(html).not.toContain(">받기</span>");
  });
});

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

  it("보상 처리 중에도 원래 버튼 라벨 폭과 로딩 접근성 상태를 유지한다", () => {
    const html = renderToStaticMarkup(
      <QuestRow
        quest={{
          ...quest,
          status: "claimable",
          reward: { gold: 1000 },
        }}
        busy
        onClaim={vi.fn()}
      />,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="두둑한 지갑 보상 수령 중"');
    expect(html).toContain('data-button-spinner="true"');
    expect(html).toContain(">받기</span>");
    expect(html).not.toContain("처리 중…");
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
