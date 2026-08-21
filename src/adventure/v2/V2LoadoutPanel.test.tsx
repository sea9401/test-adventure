import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  isSkillDisplayed,
  formatJobSpGraceRemaining,
  loadoutExclusiveConflictMessage,
  parseHiddenSkillIds,
  toggleHiddenSkill,
  V2LoadoutPanel,
  waitForLoadoutRefresh,
} from "./V2LoadoutPanel";
import {
  V2_SKILLS,
  spCostOf,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";

const realLoadoutLibrary = (skillIds: readonly V2SkillId[]) =>
  skillIds.map((skillId) => ({
    skillId,
    name: V2_SKILLS[skillId].name,
    spCost: spCostOf(V2_SKILLS[skillId]),
    equipped: true,
    category: V2_SKILLS[skillId].category,
  }));

const visibleText = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("직업 SP 산식 전환 안내", () => {
  it("유예 남은 시간을 올림한 시·분으로 표시한다", () => {
    expect(formatJobSpGraceRemaining(90 * 60 * 1_000, 0)).toBe(
      "1시간 30분",
    );
    expect(formatJobSpGraceRemaining(60_001, 0)).toBe("2분");
    expect(formatJobSpGraceRemaining(0, 1)).toBe("0분");
  });

  it("유예 중 현재 사용 SP, 새 한도, 초과량과 남은 시간을 보여준다", () => {
    const serverNow = Date.UTC(2026, 7, 17, 0, 0, 0);
    const html = renderToStaticMarkup(
      <V2LoadoutPanel
        loadout={{
          spBudget: 126,
          spUsed: 140,
          equipped: ["v2c_warrior_strike"],
          library: [
            {
              skillId: "v2c_warrior_strike",
              name: "강타",
              spCost: 140,
              equipped: true,
            },
          ],
          spMigration: {
            graceActive: true,
            graceEndsAt: serverNow + 90 * 60 * 1_000,
            serverNow,
            overBudgetBy: 14,
            removedSkillIds: [],
          },
        }}
      />,
    );

    expect(html).toContain("직업 SP 조정 유예 중");
    expect(html).toContain("현재 140 / 새 한도 126");
    expect(html).toContain("14 SP 초과");
    expect(html).toContain("남은 시간 1시간 30분");
  });

  it("유예 종료 후 이번 조회에서 장착 해제된 스킬 이름을 보여준다", () => {
    const html = renderToStaticMarkup(
      <V2LoadoutPanel
        loadout={{
          spBudget: 126,
          spUsed: 122,
          equipped: ["v2c_warrior_strike"],
          library: [
            {
              skillId: "v2c_warrior_strike",
              name: "강타",
              spCost: 4,
              equipped: true,
            },
            {
              skillId: "v2c_mage_fireball",
              name: "화염구",
              spCost: 4,
              equipped: false,
            },
          ],
          spMigration: {
            graceActive: false,
            graceEndsAt: 1,
            serverNow: 2,
            overBudgetBy: 0,
            removedSkillIds: ["v2c_mage_fireball"],
          },
        }}
      />,
    );

    expect(html).toContain("직업 SP 조정 완료");
    expect(html).toContain("화염구");
    expect(html).toContain("장착 해제");
  });
});

describe("광기 계열 배타 장착 안내", () => {
  it("후보 로드아웃에 광기 계열이 둘이면 즉시 설명한다", () => {
    expect(
      loadoutExclusiveConflictMessage([
        "v2c_berserker_madness3",
        "v2c_hegemon_dominion",
      ]),
    ).toBe("광기 계열은 하나만 장착할 수 있습니다.");
    expect(
      loadoutExclusiveConflictMessage(["v2c_berserker_madness3"]),
    ).toBeNull();
  });

  it("광기 패시브 카드에 같은 계열 장착 제한을 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2LoadoutPanel
        loadout={{
          spBudget: 99,
          spUsed: 0,
          equipped: [],
          library: [
            {
              skillId: "v2c_berserker_madness3",
              name: "광기",
              spCost: 4,
              equipped: false,
              category: "passive",
            },
          ],
        }}
      />,
    );

    expect(html).toContain("같은 계열 1개만 장착");
  });
});

describe("결투가 태세와 선언 연계 안내", () => {
  it("현재 직업의 태세와 최고 선언에 합쳐지는 하위 효과를 보여준다", () => {
    const equipped = [
      "v2c_duelist_declaration",
      "v2c_contender_insight",
      "v2c_undefeated_momentum",
      "v2c_grandchampion_hour",
    ];
    const html = renderToStaticMarkup(
      <V2LoadoutPanel
        currentJobId="grandchampion"
        loadout={{
          spBudget: 99,
          spUsed: 16,
          equipped,
          library: equipped.map((skillId) => ({
            skillId,
            name: skillId,
            spCost: 4,
            equipped: true,
            category: "buff" as const,
          })),
        }}
      />,
    );

    expect(html).toContain("결투 태세 활성 · 평타 피해 +50%");
    expect(html).toContain("챔피언의 시간에 하위 선언 3개 연계");
    expect(html).toContain("다음 평타 5회");
    expect(html).toContain("평타 방어 관통 +15%p");
    expect(html).toContain("평타 치명 상한 95%");
  });

  it("공격 스킬이 태세를 막으면 스킬 이름으로 이유를 보여준다", () => {
    const html = renderToStaticMarkup(
      <V2LoadoutPanel
        currentJobId="duelist"
        loadout={{
          spBudget: 99,
          spUsed: 4,
          equipped: ["v2c_paladin_cleave"],
          library: [{
            skillId: "v2c_paladin_cleave",
            name: "심판",
            spCost: 4,
            equipped: true,
            category: "attack",
          }],
        }}
      />,
    );

    expect(html).toContain("결투 태세 비활성 · 심판 장착 중");
  });
});

describe("장착 저장 후 상태 갱신", () => {
  it("부모의 비동기 갱신이 끝날 때까지 완료 처리하지 않는다", async () => {
    let release: (() => void) | undefined;
    const refreshGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let completed = false;

    const pending = waitForLoadoutRefresh(() => refreshGate).then(() => {
      completed = true;
    });
    await Promise.resolve();

    expect(completed).toBe(false);
    release?.();
    await pending;
    expect(completed).toBe(true);
  });
});

describe("보유 스킬 표시 설정", () => {
  it("숨김 스킬을 입력 Set 변경 없이 토글한다", () => {
    const original = new Set(["v2_skill_strike"]);
    const added = toggleHiddenSkill(original, "v2c_rogue_poison");
    const restored = toggleHiddenSkill(added, "v2_skill_strike");

    expect([...original]).toEqual(["v2_skill_strike"]);
    expect([...added]).toEqual(["v2_skill_strike", "v2c_rogue_poison"]);
    expect([...restored]).toEqual(["v2c_rogue_poison"]);
  });

  it("저장값에서 유효한 문자열 스킬 ID만 복원한다", () => {
    expect([
      ...parseHiddenSkillIds(
        '["v2_skill_strike"," v2c_rogue_poison ",null,3,"", "v2_skill_strike"]',
      ),
    ]).toEqual(["v2_skill_strike", "v2c_rogue_poison"]);
    expect([...parseHiddenSkillIds("not json")]).toEqual([]);
  });

  it("숨긴 스킬도 장착 중이면 목록에서 보호해 표시한다", () => {
    const hidden = new Set(["v2_skill_strike", "v2c_rogue_poison"]);

    expect(
      isSkillDisplayed(
        "v2_skill_strike",
        hidden,
        new Set(["v2_skill_strike"]),
      ),
    ).toBe(true);
    expect(
      isSkillDisplayed("v2c_rogue_poison", hidden, new Set()),
    ).toBe(false);
  });

  it("표시 설정과 장착 스킬 보호 안내를 렌더한다", () => {
    const html = renderToStaticMarkup(
      <V2LoadoutPanel
        loadout={{
          spBudget: 4,
          spUsed: 4,
          equipped: ["v2_skill_strike"],
          library: [
            {
              skillId: "v2_skill_strike",
              name: "강타",
              spCost: 4,
              equipped: true,
            },
          ],
        }}
      />,
    );

    expect(html).toContain("표시 스킬 1/1");
    expect(html).toContain("표시 설정");
  });
});

describe("V2LoadoutPanel 모바일 스킬 동작 영역", () => {
  it("검색 결과를 차수와 직업 계열로 좁힐 수 있다", () => {
    const html = renderToStaticMarkup(
      <V2LoadoutPanel
        loadout={{
          spBudget: 4,
          spUsed: 0,
          equipped: [],
          library: [
            {
              skillId: "v2c_warrior_strike",
              name: "강타",
              spCost: 4,
              equipped: false,
            },
          ],
        }}
      />,
    );

    expect(html).toContain("스킬 차수");
    expect(html).toContain("직업 계열");
    expect(html).toContain(">공용<");
    expect(html).toContain(">6차<");
    expect(html).toContain(">전사 계열<");
    expect(html).toContain(">생존 계열<");
  });

  it("즐겨찾기 옆 동작 버튼을 모바일에서는 넓게, 데스크톱에서는 고정 폭으로 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2LoadoutPanel
        loadout={{
          spBudget: 4,
          spUsed: 4,
          equipped: ["v2_skill_strike"],
          library: [
            {
              skillId: "v2_skill_strike",
              name: "강타",
              spCost: 4,
              equipped: true,
            },
            {
              skillId: "v2c_rogue_poison",
              name: "독침",
              spCost: 4,
              equipped: false,
            },
          ],
        }}
      />,
    );

    expect(html.match(/w-full sm:w-\[6\.25rem\]/g)).toHaveLength(2);
    expect(html.match(/whitespace-nowrap/g)).toHaveLength(4);
    expect(html).toContain("min-w-0 flex-1 sm:min-w-52");
    expect(html).toContain("flex-col sm:flex-row");
    expect(html).toContain("min-w-0 max-w-full overflow-x-auto");
    expect(html).toContain("h-11 w-11 sm:h-9 sm:w-8");
    expect(html).toContain("h-11 w-11 sm:h-8 sm:w-8");
    expect(html).toContain("h-11 w-11 sm:h-6 sm:w-5");
    expect(html).toContain(">해제<");
    expect(html).toContain(">SP 부족<");
  });

  it("생활 패시브가 있어도 상단에는 전투 장착 영역만 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2LoadoutPanel
        loadout={{
          spBudget: 4,
          spUsed: 4,
          equipped: ["v2_skill_strike", "v2c_farmer_seedselection"],
          library: [
            {
              skillId: "v2_skill_strike",
              name: "강타",
              spCost: 4,
              equipped: true,
            },
            {
              skillId: "v2c_farmer_seedselection",
              name: "씨앗 선별",
              spCost: 0,
              equipped: true,
              category: "passive",
            },
          ],
        }}
      />,
    );

    expect(html).toContain("전투 스킬 장착");
    expect(html.match(/전부 해제/g)).toHaveLength(1);
    expect(html).not.toContain('id="lifestyle-equipped-heading"');
    expect(html).not.toContain('id="lifestyle-equipped-skills"');
    expect(html).not.toContain('aria-controls="lifestyle-equipped-skills"');
    expect(html).not.toContain('aria-label="씨앗 선별 해제"');
  });

  it("모바일에서 장착 전투 스킬을 개수 요약과 함께 기본으로 접는다", () => {
    const html = renderToStaticMarkup(
      <V2LoadoutPanel
        loadout={{
          spBudget: 8,
          spUsed: 8,
          equipped: ["v2_skill_strike", "v2c_rogue_poison"],
          library: [
            {
              skillId: "v2_skill_strike",
              name: "강타",
              spCost: 4,
              equipped: true,
            },
            {
              skillId: "v2c_rogue_poison",
              name: "독침",
              spCost: 4,
              equipped: true,
            },
          ],
        }}
      />,
    );

    expect(html).toContain('class="sr-only">전투 스킬 2개 장착</span>');
    expect(html).toContain('aria-hidden="true">전투 · 2개</span>');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="combat-equipped-skills"');
    expect(html).toContain('aria-label="전투 스킬 펼쳐보기"');
    expect(html).toContain(">펼쳐보기<");
    expect(html).toContain('class="flex shrink-0 items-center gap-1"');
    expect(html.match(/h-11 shrink-0 items-center whitespace-nowrap/g)).toHaveLength(
      2,
    );
    expect(html).toContain(
      'id="combat-equipped-skills" class="hidden sm:block"',
    );
    expect(html).toContain("flex-nowrap gap-1.5 overflow-x-auto");
    expect(html).toContain("sm:flex-wrap sm:overflow-visible");
  });

});

describe("V2LoadoutPanel 원소 공명 유효 SP", () => {
  const materials = [
    "v2c_firemage_inferno",
    "v2c_frostmage_glacier",
    "v2c_lightningmage_thunderbolt",
    "v2c_windmage_tempest",
    "v2c_earthmage_tectonic",
  ] as const satisfies readonly V2SkillId[];

  it("원소군주 회로의 28 SP 총액과 공명 재료 기본·유효 비용을 보여준다", () => {
    const equipped = [
      ...materials,
      "v2c_elementallord_surge",
      "v2c_elementallord_resonance",
    ] as const;
    const html = renderToStaticMarkup(
      <V2LoadoutPanel
        loadout={{
          spBudget: 99,
          spUsed: 52,
          equipped: [...equipped],
          library: realLoadoutLibrary(equipped),
        }}
      />,
    );

    expect(visibleText(html)).toContain("스킬포인트 28 / 99");
    expect(html.match(/공명 재료 · 2 SP/g)).toHaveLength(5);
    expect(visibleText(html)).toContain("기본 8 SP");
  });

  it("태초술사 회로의 재료와 오원소 폭주 촉매를 각각 1 SP로 표시한다", () => {
    const equipped = [
      ...materials,
      "v2c_primordialmage_return",
      "v2c_primordialmage_resonance",
      "v2c_elementallord_surge",
    ] as const;
    const html = renderToStaticMarkup(
      <V2LoadoutPanel
        loadout={{
          spBudget: 99,
          spUsed: 75,
          equipped: [...equipped],
          library: realLoadoutLibrary(equipped),
        }}
      />,
    );

    expect(visibleText(html)).toContain("스킬포인트 31 / 99");
    expect(html.match(/공명 재료 · 1 SP/g)).toHaveLength(5);
    expect(html).toContain("근원 촉매 · 1 SP · 태초회귀 강화");
    expect(visibleText(html)).toContain("기본 16 SP");
  });

  it("두 회로를 모두 장착하면 근원공명 우선 안내를 표시한다", () => {
    const equipped = [
      ...materials,
      "v2c_elementallord_surge",
      "v2c_elementallord_resonance",
      "v2c_primordialmage_return",
      "v2c_primordialmage_resonance",
    ] as const;
    const html = renderToStaticMarkup(
      <V2LoadoutPanel
        loadout={{
          spBudget: 99,
          spUsed: 99,
          equipped: [...equipped],
          library: realLoadoutLibrary(equipped),
        }}
      />,
    );

    expect(html).toContain("근원공명 우선 · 원소군주 회로 비활성");
  });
});
