import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  isSkillDisplayed,
  loadoutExclusiveConflictMessage,
  parseHiddenSkillIds,
  toggleHiddenSkill,
  V2LoadoutPanel,
  waitForLoadoutRefresh,
} from "./V2LoadoutPanel";

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

  it("즐겨찾기 옆 동작 버튼의 폭을 고정하고 줄바꿈을 막는다", () => {
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

    expect(html.match(/w-\[6\.25rem\]/g)).toHaveLength(2);
    expect(html.match(/whitespace-nowrap/g)).toHaveLength(2);
    expect(html).toContain(">해제<");
    expect(html).toContain(">SP 부족<");
  });

  it("생활 패시브를 항상 적용 상태로 표시하고 해제 동작을 제공하지 않는다", () => {
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
    expect(html).toContain("생활 패시브 적용");
    expect(html).toContain("씨앗 선별");
    expect(html).toContain("SP 0");
    expect(html).toContain("배우면 자동으로 항상 적용됩니다.");
    expect(html).toContain("적용 중");
    expect(html.match(/전부 해제/g)).toHaveLength(1);
    expect(html).not.toContain('aria-label="씨앗 선별 해제"');
  });
});
