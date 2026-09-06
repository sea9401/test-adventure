import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  nextLoadoutStatFeedback,
  refreshLoadoutViews,
  SkillLearningCard,
  SkillRitualPowerScopeHelp,
  SkillLearningCostSummary,
  skillRitualCurrencyPatch,
  SkillRitualButton,
  skillRitualCostLabel,
} from "./V2SkillLearnView";
import { spCostOf, V2_SKILLS } from "@/adventure/data/v2/v2Skills";

describe("학습 카드 상세와 기존 액션 분리", () => {
  it("강타 이름·설명·효과에 상세 트리거를 제공하면서 학습 액션을 유지한다", () => {
    const html = renderToStaticMarkup(
      <SkillLearningCard
        skill={{
          skillId: "v2_skill_strike",
          name: "강타",
          cost: 1500,
          spCost: 4,
          learned: false,
        }}
        usable={1500}
        busy={null}
        onLearn={() => {}}
        onOpenDetail={() => {}}
      />,
    );

    expect(html).toContain('aria-label="강타 상세 보기"');
    expect(html).toContain(">학습<");
    expect(html).toContain("<details");
    expect(html).not.toMatch(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<details/);
  });

  it("강화 의식 액션을 상세가 아닌 강화로 부른다", () => {
    const html = renderToStaticMarkup(
      <SkillRitualButton
        skill={{
          skillId: "v2_skill_strike",
          name: "강타",
          spCost: 4,
          equipped: true,
        }}
        busy={null}
        maxed={false}
        onOpen={() => {}}
      />,
    );

    expect(html).toContain(">강화<");
    expect(html).not.toContain(">상세<");
  });
});

describe("장착 변경 후 전투 상태 동기화", () => {
  it("스킬 상세와 전역 전투 상태를 모두 갱신하고 완료될 때까지 기다린다", async () => {
    let releaseLoadout: (() => void) | undefined;
    let releaseGameState: (() => void) | undefined;
    const calls: string[] = [];
    const loadoutGate = new Promise<void>((resolve) => {
      releaseLoadout = resolve;
    });
    const gameStateGate = new Promise<void>((resolve) => {
      releaseGameState = resolve;
    });

    let completed = false;
    const pending = refreshLoadoutViews(
      async () => {
        calls.push("loadout");
        await loadoutGate;
      },
      async () => {
        calls.push("game-state");
        await gameStateGate;
      },
    ).then(() => {
      completed = true;
    });
    await Promise.resolve();

    expect(calls).toEqual(["loadout", "game-state"]);
    expect(completed).toBe(false);

    releaseLoadout?.();
    await Promise.resolve();
    expect(completed).toBe(false);

    releaseGameState?.();
    await pending;
    expect(completed).toBe(true);
  });
});

describe("SkillLearningCostSummary", () => {
  it("원시 포식자 액티브와 패시브의 파생 SP를 표시한다", () => {
    for (const skillId of [
      "v2c_primalpredator_primalfeast",
      "v2c_primalpredator_apex",
    ] as const) {
      const sp = spCostOf(V2_SKILLS[skillId]);
      const html = renderToStaticMarkup(
        <SkillLearningCostSummary learnCost={12_000} spCost={sp} learned />,
      );
      expect(sp).toBe(13);
      expect(html).toContain("장착 SP 13");
    }
  });

  it("학습 전에 숙달 포인트와 장착 SP 비용을 명확히 구분한다", () => {
    const html = renderToStaticMarkup(
      <SkillLearningCostSummary learnCost={1500} spCost={4} learned={false} />,
    );

    expect(html).toContain("학습 숙달 1,500");
    expect(html).toContain("장착 SP 4");
  });

  it("학습 후에도 장착 SP 비용은 계속 표시한다", () => {
    const html = renderToStaticMarkup(
      <SkillLearningCostSummary learnCost={1500} spCost={4} learned />,
    );

    expect(html).not.toContain("학습 숙달");
    expect(html).toContain("장착 SP 4");
  });
});

describe("skillRitualCostLabel", () => {
  it("강화 비용은 골드와 숙달 포인트만 안내한다", () => {
    expect(
      skillRitualCostLabel({ goldCost: 3_000_000, proficiencyCost: 800 }),
    ).toBe("비용 3,000,000G · 숙달 800");
  });
});

describe("skillRitualCurrencyPatch", () => {
  it("숙달 포인트 잔액을 직업 숙련도 전역 상태에 기록하지 않는다", () => {
    expect(
      skillRitualCurrencyPatch({
        gold: 1_200,
        bankedGold: 3_400,
        points: 567,
      }),
    ).toEqual({ gold: 1_200, bankedGold: 3_400 });
  });
});

describe("SkillRitualPowerScopeHelp", () => {
  it("위력 강화가 적용되는 직접 효과와 제외되는 지속·상태 효과를 함께 안내한다", () => {
    const html = renderToStaticMarkup(<SkillRitualPowerScopeHelp />);

    expect(html).toContain("직접 피해");
    expect(html).toContain("공격력·스탯·HP·스택·조건부");
    expect(html).toContain("즉시 회복");
    expect(html).toContain("보호막");
    expect(html).toContain("중독·출혈·화상 지속 피해");
    expect(html).toContain("지속 회복");
    expect(html).toContain("버프·디버프");
    expect(html).toContain("MP 회복");
    expect(html).toContain("HP 소모량");
  });
});

describe("nextLoadoutStatFeedback", () => {
  it("최초 상태는 현재 스냅샷만 만들고 변경분은 만들지 않는다", () => {
    expect(
      nextLoadoutStatFeedback(
        null,
        {
          character: { maxHp: 1000, maxMp: 200 },
          combat: { atk: 100, def: 80, spd: 30 },
        },
        false,
      ),
    ).toEqual({
      current: { maxHp: 1000, maxMp: 200, atk: 100, def: 80, spd: 30 },
      delta: null,
    });
  });

  it("장착 저장 뒤 서버 확정 수치를 직전 스냅샷과 비교한다", () => {
    expect(
      nextLoadoutStatFeedback(
        { atk: 100, def: 80, spd: 30 },
        { combat: { atk: 115, def: 72, spd: 30 } },
        true,
      ),
    ).toEqual({
      current: { atk: 115, def: 72, spd: 30 },
      delta: { atk: 15, def: -8 },
    });
  });

  it("전투 수치가 없는 응답은 기존 표시를 지우거나 증감치를 만들지 않는다", () => {
    expect(
      nextLoadoutStatFeedback(
        { atk: 100, def: 80 },
        { combat: null },
        true,
      ),
    ).toEqual({ current: { atk: 100, def: 80 }, delta: null });
  });
});
