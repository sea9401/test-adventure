import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CODEX_TAB_ITEMS,
  DropChip,
  classifyCodexEquipmentIds,
  codexEquipmentProgress,
  codexTabFromParam,
  codexThemeDeepDepth,
  codexUniqueDropSummary,
  SKY_RIFT_CODEX_DROP_SUMMARY,
  SKY_RIFT_WEAPON_DROP_LABEL,
  shouldShowCodexTutorial,
  shouldLoadCodexMastery,
  spCollectionSpRange,
  spEligibleJobProgress,
  spFruitCodexSource,
} from "./V2CodexView";
import { fishCodexCardState } from "./FishingCodexPanel";
import {
  commonIdsForDepthRange,
  SKY_RIFT_WEAPON_IDS,
} from "@/adventure/data/v2/dungeonUniqueDrops";

describe("모험의 서 이용 안내", () => {
  it("처음 방문한 이용자에게 표시하고 확인 후에는 자동으로 숨긴다", () => {
    expect(shouldShowCodexTutorial(false, false)).toBe(true);
    expect(shouldShowCodexTutorial(true, false)).toBe(false);
  });

  it("이미 확인했어도 안내 버튼으로 다시 볼 수 있다", () => {
    expect(shouldShowCodexTutorial(true, true)).toBe(true);
  });
});

describe("모험의 서 URL 탭", () => {
  it("제작 완료 화면의 장비 도감 링크를 장비 탭으로 연다", () => {
    expect(codexTabFromParam("equipment")).toBe("equipment");
  });

  it("요리 도감 링크를 요리 탭으로 연다", () => {
    expect(codexTabFromParam("cooking")).toBe("cooking");
  });

  it("숙련 링크를 숙련 탭으로 열고 SP 수집 바로 뒤에 표시한다", () => {
    expect(codexTabFromParam("mastery")).toBe("mastery");
    expect(CODEX_TAB_ITEMS).toEqual([
      ["spFruit", "SP 수집"],
      ["mastery", "숙련"],
      ["job", "직업"],
      ["equipment", "장비"],
      ["huntground", "사냥터"],
      ["fish", "어보"],
      ["cooking", "요리"],
      ["life", "현장 기록"],
      ["title", "칭호"],
    ]);
  });

  it("숙련 탭 최초 진입의 idle 상태에서만 스냅샷을 요청한다", () => {
    expect(shouldLoadCodexMastery("mastery", "idle")).toBe(true);
    expect(shouldLoadCodexMastery("fish", "idle")).toBe(false);
    expect(shouldLoadCodexMastery("mastery", "loading")).toBe(false);
    expect(shouldLoadCodexMastery("mastery", "ready")).toBe(false);
    expect(shouldLoadCodexMastery("mastery", "disabled")).toBe(false);
    expect(shouldLoadCodexMastery("mastery", "error")).toBe(false);
  });

  it("탭이 없거나 잘못됐으면 기존 기본 탭을 사용한다", () => {
    expect(codexTabFromParam(null)).toBe("spFruit");
    expect(codexTabFromParam("unknown")).toBe("spFruit");
    expect(codexTabFromParam("materials")).toBe("spFruit");
  });
});

describe("모험의 서 사냥터 표시", () => {
  it("각 사냥터는 세 단계 중 최심부를 대표 깊이로 사용한다", () => {
    expect(codexThemeDeepDepth(1)).toBe(6);
    expect(codexThemeDeepDepth(7)).toBe(12);
    expect(codexThemeDeepDepth(67)).toBe(72);
    expect(codexThemeDeepDepth(73)).toBe(78);
    expect(codexThemeDeepDepth(79)).toBe(84);
  });

  it("정규 드랍을 일반 장비와 세트 장비로 분리한다", () => {
    expect(
      classifyCodexEquipmentIds([
        "v2_canyon_greatsword",
        "v2_canyon_set_armor",
      ]),
    ).toEqual({
      common: ["v2_canyon_greatsword"],
      set: ["v2_canyon_set_armor"],
    });
  });

  it("상위 사냥터의 태그 세트 장비도 세트로 분류한다", () => {
    expect(
      classifyCodexEquipmentIds([
        "v2_throne_greatsword",
        "v2_throne_black_armor",
      ]),
    ).toEqual({
      common: [],
      set: ["v2_throne_greatsword", "v2_throne_black_armor"],
    });
  });

  it("마지막 지역의 정규 드랍은 모두 세트 장비로 표시한다", () => {
    const ids = [
      ...commonIdsForDepthRange(73, 78),
      ...SKY_RIFT_WEAPON_IDS,
    ];

    const classified = classifyCodexEquipmentIds(ids);

    expect(classified.common).toEqual([]);
    expect(classified.set).toEqual(ids);
  });

  it("천공 균열 장비는 난이도별 별도 풀이 아니라 전역 방어구 풀이라고 안내한다", () => {
    expect(SKY_RIFT_CODEX_DROP_SUMMARY).toContain("모든 난이도 동일 방어구 풀");
    expect(SKY_RIFT_CODEX_DROP_SUMMARY).toContain("깊이별 총 0.05~0.10%");
  });

  it("천공 균열 무기 획득처는 내부 단계 번호 대신 지역 단계명으로 표시한다", () => {
    expect(SKY_RIFT_WEAPON_DROP_LABEL).toContain("천공 균열 최심부");
    expect(SKY_RIFT_WEAPON_DROP_LABEL).not.toContain("78단계");
  });

  it("별의 무덤은 시그니처 유니크 총 드랍률을 정확히 안내한다", () => {
    expect(commonIdsForDepthRange(79, 84)).toEqual(
      commonIdsForDepthRange(73, 78),
    );
    expect(codexUniqueDropSummary(79)).toBe(
      "처치당 총 0.0035% · 무작위 1종",
    );
    expect(codexUniqueDropSummary(73)).toBe("매우 낮은 확률");
  });
});

describe("모험의 서 사냥터 장비 도감 상태", () => {
  it("중복 드랍을 한 번만 세어 지역 진행률과 완료 여부를 계산한다", () => {
    expect(
      codexEquipmentProgress(
        [
          "v2_canyon_greatsword",
          "v2_canyon_set_armor",
          "v2_canyon_greatsword",
        ],
        new Set(["v2_canyon_greatsword"]),
      ),
    ).toEqual({ registeredCount: 1, totalCount: 2, complete: false });

    expect(
      codexEquipmentProgress(
        ["v2_canyon_greatsword", "v2_canyon_set_armor"],
        new Set(["v2_canyon_greatsword", "v2_canyon_set_armor"]),
      ),
    ).toEqual({ registeredCount: 2, totalCount: 2, complete: true });
  });

  it("장비 칩에 등록과 미등록을 글자로 표시한다", () => {
    const registered = renderToStaticMarkup(
      createElement(DropChip, {
        id: "v2_canyon_greatsword",
        kind: "common",
        registered: true,
        onOpen: () => undefined,
      }),
    );
    const missing = renderToStaticMarkup(
      createElement(DropChip, {
        id: "v2_canyon_set_armor",
        kind: "set",
        registered: false,
        onOpen: () => undefined,
      }),
    );

    expect(registered).toContain("장비 도감 등록");
    expect(registered).toContain("등록");
    expect(missing).toContain("장비 도감 미등록");
    expect(missing).toContain("미등록");
  });

  it("도감 상태를 알 수 없으면 미등록으로 단정하지 않는다", () => {
    const html = renderToStaticMarkup(
      createElement(DropChip, {
        id: "v2_canyon_greatsword",
        kind: "common",
        onOpen: () => undefined,
      }),
    );

    expect(html).not.toContain("장비 도감 미등록");
    expect(html).not.toContain(">미등록<");
  });
});

describe("모험의 서 SP 열매 획득처", () => {
  it("SP 열매 IV는 공허의 대사제 보상으로만 표시한다", () => {
    expect(spFruitCodexSource(4)).toBe("공허의 대사제 보상");
  });

  it("SP 열매 V는 폭풍 원정 완주 보상으로만 표시한다", () => {
    expect(spFruitCodexSource(5)).toBe("폭풍 원정 완주 보상");
  });

  it("나머지 SP 열매는 기존 협동 보스 획득처만 표시한다", () => {
    expect(spFruitCodexSource(1)).toBe("산군 보상");
  });
});

describe("모험의 서 SP 수집 목록", () => {
  it("각 수집처의 현재 획득 SP와 규칙상 최대 SP를 함께 계산한다", () => {
    expect(
      [
        ["기본 SP", 30, 42],
        ["직업 해금", 8, 42],
        ["어보", 3, 42],
        ["장비 도감", 5, 42],
      ].map(([label, value, jobUnlockTotal]) =>
        spCollectionSpRange({
          label: String(label),
          value: Number(value),
          jobUnlockTotal: Number(jobUnlockTotal),
        }),
      ),
    ).toEqual([
      { current: 30, maximum: 30 },
      { current: 8, maximum: 42 },
      { current: 3, maximum: 7 },
      { current: 5, maximum: 12 },
    ]);
  });

  it("SP를 지급하지 않는 0차 직업은 직업 해금 최대치에서 제외한다", () => {
    expect(
      spEligibleJobProgress([
        { tier: 0, unlocked: true },
        { tier: 1, unlocked: true },
        { tier: 2, unlocked: false },
      ]),
    ).toEqual({ current: 1, total: 2 });
  });

  it("50개를 넘는 직업은 실제 직업 해금 SP 환산 규칙으로 최대치를 표시한다", () => {
    expect(
      spCollectionSpRange({
        label: "직업 해금",
        value: 63,
        jobUnlockTotal: 138,
      }),
    ).toEqual({ current: 63, maximum: 94 });
  });
});

describe("어보 표본 등록 상태", () => {
  it("등록과 포획 기록의 네 상태를 구분한다", () => {
    expect(fishCodexCardState(true, true)).toEqual({
      visible: true,
      canExtract: true,
      status: "등재",
      recordLabel: null,
    });
    expect(fishCodexCardState(true, false)).toMatchObject({
      visible: true,
      canExtract: true,
      status: "등재",
      recordLabel: "표본 등록 · 직접 어획 기록 없음",
    });
    expect(fishCodexCardState(false, true)).toMatchObject({
      visible: true,
      canExtract: false,
      status: "미등록",
    });
    expect(fishCodexCardState(false, false)).toMatchObject({
      visible: false,
      canExtract: false,
      status: "미발견",
    });
  });
});
