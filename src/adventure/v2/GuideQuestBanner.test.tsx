import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CurrentGoalBanner,
  GrowthPassRewardBanner,
  RepeatRewardBanner,
  homeGuidePlan,
} from "./GuideQuestBanner";
import type { QuestView } from "@/adventure/data/v2/v2Quests";

describe("메인 반복 퀘스트 보상 알림", () => {
  const bundle = (
    scope: "daily" | "weekly",
    claimable: boolean,
    potions: number,
  ) => ({
    scope,
    completed: claimable ? 5 : 1,
    total: scope === "daily" ? 7 : 8,
    goal: scope === "daily" ? 4 : 5,
    potions,
    claimed: false,
    claimable,
  });

  it("받을 수 있는 일일·주간 보상과 포션 수량을 함께 보여준다", () => {
    const html = renderToStaticMarkup(
      <RepeatRewardBanner
        daily={bundle("daily", true, 2)}
        weekly={bundle("weekly", true, 5)}
        onOpen={vi.fn()}
      />,
    );

    expect(html).toContain("받을 수 있는 퀘스트 보상");
    expect(html).toContain("일일 보상");
    expect(html).toContain("스태미나 포션 2개");
    expect(html).toContain("주간 보상");
    expect(html).toContain("스태미나 포션 5개");
  });

  it("수령 가능한 반복 보상이 없으면 표시하지 않는다", () => {
    const html = renderToStaticMarkup(
      <RepeatRewardBanner
        daily={bundle("daily", false, 2)}
        weekly={bundle("weekly", false, 5)}
        onOpen={vi.fn()}
      />,
    );

    expect(html).toBe("");
  });
});

describe("메인 추적 퀘스트 카드", () => {
  it("추적 배지와 현재 진행 수치·진행 막대를 표시한다", () => {
    const html = renderToStaticMarkup(
      <CurrentGoalBanner
        tracked
        onOpen={vi.fn()}
        current={{
          id: "gold_100k",
          line: "collection",
          title: "두둑한 지갑",
          desc: "총 보유 골드 100,000 G를 달성하세요.",
          href: null,
          reward: {},
          status: "active",
          points: 20,
          progress: 42_000,
          goal: 100_000,
          detailKind: null,
        }}
      />,
    );

    expect(html).toContain("추적 중");
    expect(html).toContain("42,000 / 100,000");
    expect(html).toContain("width:42%");
  });
});

describe("홈의 성장 패스 안내", () => {
  const view = (over: Partial<QuestView>): QuestView => ({
    id: "q",
    line: "collection",
    title: "제목",
    desc: "설명",
    href: null,
    reward: {},
    status: "active",
    points: 0,
    progress: null,
    goal: null,
    detailKind: null,
    ...over,
  });
  const passClaimable = view({
    id: "gp_tier4",
    line: "growth_pass_4",
    title: "4차 전직",
    status: "claimable",
    reward: { boundStaminaPotions: 5, masteryCertificates: 1_000 },
  });
  const passActive = view({
    id: "gp_t4_6000",
    line: "growth_pass_4",
    title: "4차 숙련도 6,000",
    progress: 5_339,
    goal: 6_000,
  });
  const passLocked = view({ id: "gp_t4_12000", line: "growth_pass_4", status: "locked" });
  const achievement = view({ id: "gold_100k", title: "두둑한 지갑" });

  it("기초 튜토리얼이 남아 있으면 체크리스트에 성장 패스 단계를 섞지 않는다", () => {
    const basic = view({ id: "b_bank", line: "basics", title: "은행 이용" });
    const plan = homeGuidePlan([basic, passActive, passLocked], basic, null);
    expect(plan.tutorialTodo.map((q) => q.id)).toEqual(["b_bank"]);
    expect(plan.goal).toBeNull();
    expect(plan.passClaimable).toEqual([]);
  });

  it("받을 수 있는 단계가 있으면 추적 중인 업적이 있어도 알린다", () => {
    const plan = homeGuidePlan(
      [passClaimable, passActive, achievement],
      achievement,
      "gold_100k",
    );
    expect(plan.passClaimable.map((q) => q.id)).toEqual(["gp_tier4"]);
    expect(plan.goal?.id).toBe("gold_100k");
  });

  it("받을 단계가 없으면 진행 중인 단계를 목표로 보여 주되 직접 추적한 업적이 먼저다", () => {
    expect(homeGuidePlan([passActive, achievement], passActive, null).goal?.id).toBe(
      "gp_t4_6000",
    );
    expect(
      homeGuidePlan([passActive, achievement], achievement, "gold_100k").goal?.id,
    ).toBe("gold_100k");
  });

  it("받을 단계가 있을 때는 다음 단계 카드를 겹쳐 보여 주지 않는다", () => {
    const plan = homeGuidePlan([passClaimable, passActive], passClaimable, null);
    expect(plan.passClaimable).toHaveLength(1);
    expect(plan.goal).toBeNull();
  });

  it("진행 중인 목표가 여럿이면 달성에 가장 가까운 것을 보여 준다", () => {
    const boss = view({ id: "gp_boss_canyon", line: "growth_pass_4", title: "스콜피온 킹 토벌" });
    const tower = view({
      id: "gp_tower10",
      line: "growth_pass_4",
      title: "숙련의 탑 10층",
      progress: 9,
      goal: 10,
    });
    expect(homeGuidePlan([boss, passActive, tower], boss, null).goal?.id).toBe("gp_tower10");
    expect(homeGuidePlan([boss], boss, null).goal?.id).toBe("gp_boss_canyon");
  });

  it("성장 패스를 모두 받은 계정은 전과 같이 추천 업적을 본다", () => {
    const done = view({ id: "gp_tier7", line: "growth_pass_4", status: "claimed" });
    expect(homeGuidePlan([done, achievement], achievement, null).goal?.id).toBe(
      "gold_100k",
    );
  });

  it("받을 수 있는 목표 수와 첫 목표 이름을 보여 준다", () => {
    const html = renderToStaticMarkup(
      <GrowthPassRewardBanner
        items={[passClaimable, { ...passClaimable, id: "gp_t4_6000", title: "4차 숙련도 6,000" }]}
        onOpen={vi.fn()}
      />,
    );
    expect(html).toContain("성장 패스");
    expect(html).toContain("받을 수 있는 목표 보상 2개");
    expect(html).toContain("4차 전직 외 1개");
  });

  it("진행 중인 단계 카드는 성장 패스라고 표시한다", () => {
    const html = renderToStaticMarkup(
      <CurrentGoalBanner current={passActive} label="성장 패스" onOpen={vi.fn()} />,
    );
    expect(html).toContain("성장 패스");
    expect(html).toContain("5,339 / 6,000");
  });
});
