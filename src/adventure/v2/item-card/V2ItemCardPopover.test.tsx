import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { itemCardPosition, V2ItemCard } from "./V2ItemCardPopover";
import { V2ItemCompareCard } from "./V2ItemCompareCard";

describe("V2ItemCard set information", () => {
  it("긴 장비 카드의 상단을 고정 상단 바 아래에 유지한다", () => {
    const { pos } = itemCardPosition(
      { top: 520, bottom: 570, left: 30 },
      { width: 360, height: 640, top: 72 },
    );

    expect(pos).toEqual({ bottom: 126, maxHeight: 442 });
    expect(640 - Number(pos.bottom) - Number(pos.maxHeight)).toBe(72);
  });

  it("상단 바 안의 앵커는 카드를 상단 바 아래에 배치한다", () => {
    const { pos } = itemCardPosition(
      { top: 20, bottom: 40, left: 30 },
      { width: 360, height: 640, top: 72 },
    );

    expect(pos).toEqual({ top: 72, maxHeight: 560 });
  });

  it.each([
    [true, "도감 등록"],
    [false, "도감 미등록"],
  ])("shows the equipment codex state (%s)", (registered, label) => {
    const html = renderToStaticMarkup(
      <V2ItemCard
        item={V2_EQUIPMENT.v2_iron_sword}
        anchor={{ top: 20, bottom: 60, left: 20 }}
        onClose={() => undefined}
        codexRegistered={registered}
      />,
    );

    expect(html).toContain(label);
    expect(html).toContain(
      registered ? "장비 도감에 등록됨" : "장비 도감에 등록되지 않음",
    );
  });

  it("인벤토리 상세 카드의 미등록 배지도 즉시 등록 버튼으로 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2ItemCard
        item={V2_EQUIPMENT.v2_iron_sword}
        anchor={{ top: 20, bottom: 60, left: 20 }}
        onClose={() => undefined}
        codexRegistered={false}
        codexRegister={{ busy: false, onRegister: () => undefined }}
      />,
    );

    expect(html).toContain("도감 미등록");
    expect(html).toContain("눌러서 바로 등록");
  });

  it("lists every compatible item for a threshold-based tag set", () => {
    const item = V2_EQUIPMENT.v2_crafted_combo_bow;
    const html = renderToStaticMarkup(
      <V2ItemCard
        item={item}
        anchor={{ top: 20, bottom: 60, left: 20 }}
        onClose={() => undefined}
        equippedIds={new Set([item.id])}
      />,
    );

    expect(html).toContain("세트 정보");
    expect(html).toContain("연격각인 장비 세트");
    expect(html).toContain("세트 장비");
    for (const pieceName of [
      "연환궁",
      "연격각인 전투복",
      "연격각인 장갑",
      "연격각인 장화",
      "연환 반지",
      "맥동 목걸이",
    ]) {
      expect(html).toContain(pieceName);
    }
  });

  it("keeps fixed-piece sets on the same set-information layout", () => {
    const item = V2_EQUIPMENT.v2_canyon_set_armor;
    const html = renderToStaticMarkup(
      <V2ItemCard
        item={item}
        anchor={{ top: 20, bottom: 60, left: 20 }}
        onClose={() => undefined}
        equippedIds={new Set([item.id])}
      />,
    );

    expect(html).toContain("세트 정보");
    expect(html).toContain("세트 장비");
    expect(html).toContain("마른땅 갑주");
    expect(html).toContain("분열의 장갑");
    expect(html).toContain("협곡 보행화");
  });

  it("강화 장비의 최종 공격력 아래에 기본 수치와 강화 증가분을 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2ItemCard
        item={V2_EQUIPMENT.v2_iron_sword}
        anchor={{ top: 20, bottom: 60, left: 20 }}
        onClose={() => undefined}
        roll={{ power: 100, weight: 0, options: {} }}
        enhance={{ level: 5, bonusPct: 8 }}
      />,
    );

    expect(html).toContain("+108");
    expect(html).toContain("기본 +100 · 강화 +8");
  });

  it("강화 단계는 별도 배지 대신 장비명과 같은 제목에 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2ItemCard
        item={V2_EQUIPMENT.v2_iron_sword}
        anchor={{ top: 20, bottom: 60, left: 20 }}
        onClose={() => undefined}
        enhance={{ level: 11, bonusPct: 109 }}
      />,
    );

    expect(html).toMatch(/<h2[^>]*>철검 \+11<\/h2>/);
    expect(html).not.toContain("강화 +11");
  });

  it("합일의 망토에서 핵심 기믹 판정과 강화 수치를 펼쳐 볼 수 있다", () => {
    const html = renderToStaticMarkup(
      <V2ItemCard
        item={V2_EQUIPMENT.v2_sky_sig_unity_cloak}
        anchor={{ top: 20, bottom: 60, left: 20 }}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("핵심 기믹이란?");
    for (const label of [
      "중력 반발",
      "상처 파열",
      "추적 사격",
      "그림자 잔상",
      "맹독 폭발",
      "과부하 낙뢰",
      "성역 소비",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("서로 다른 3종");
    expect(html).toContain("공격·회복 +18% (3행동)");
  });

  it("다른 6티어 유니크에는 핵심 기믹 펼침을 표시하지 않는다", () => {
    const html = renderToStaticMarkup(
      <V2ItemCard
        item={V2_EQUIPMENT.v2_sky_sig_collapse_armor}
        anchor={{ top: 20, bottom: 60, left: 20 }}
        onClose={() => undefined}
      />,
    );

    expect(html).not.toContain("핵심 기믹이란?");
  });

  it.each([
    ["v2_sanctum_sig_spire_staff", true],
    ["v2_swamp_bruiser_armor", false],
  ] as const)("장비 등급을 유니크 배지로 명시한다 (%s)", (itemId, unique) => {
    const html = renderToStaticMarkup(
      <V2ItemCard
        item={V2_EQUIPMENT[itemId]}
        anchor={{ top: 20, bottom: 60, left: 20 }}
        onClose={() => undefined}
      />,
    );

    expect(html.includes(">유니크<")).toBe(unique);
  });
});

describe("V2ItemCompareCard 읽기 전용", () => {
  it("거래소에서는 장착 액션 없이 현재 장착 장비와 후보를 비교한다", () => {
    const html = renderToStaticMarkup(
      <V2ItemCompareCard
        candidate={{ item: V2_EQUIPMENT.v2_greatsword }}
        equipped={{ item: V2_EQUIPMENT.v2_iron_sword }}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain("아이템 비교");
    expect(html).toContain("현재 장착 중");
    expect(html).toContain("비교 대상");
    expect(html).toContain("철검");
    expect(html).toContain("한타검");
    expect(html).not.toContain("장착하기");
    expect(html).not.toContain(">해제<");
  });

  it("비교 화면에서도 강화 장비의 기본 수치를 함께 보여준다", () => {
    const html = renderToStaticMarkup(
      <V2ItemCompareCard
        candidate={{
          item: V2_EQUIPMENT.v2_greatsword,
          roll: { power: 110, weight: 0, options: {} },
        }}
        equipped={{
          item: V2_EQUIPMENT.v2_iron_sword,
          roll: { power: 100, weight: 0, options: {} },
          enhance: { level: 5, bonusPct: 8 },
        }}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain("기본 +100 · 강화 +8");
    expect(html).toContain("+110");
  });
});
