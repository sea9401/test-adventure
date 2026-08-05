import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { V2ItemCard } from "./V2ItemCardPopover";
import { V2ItemCompareCard } from "./V2ItemCompareCard";

describe("V2ItemCard set information", () => {
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
