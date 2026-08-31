import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  diffLoadoutStats,
  loadoutStatSnapshot,
  LoadoutStatResponsiveLayout,
  LoadoutStatSummary,
} from "./LoadoutStatSummary";

describe("loadoutStatSnapshot", () => {
  it("서버 상태에서 표시할 주요 능력치만 유한한 숫자로 정규화한다", () => {
    expect(
      loadoutStatSnapshot({
        character: { maxHp: 3456, maxMp: 780 },
        combat: {
          power: 9_876,
          atk: 1200,
          magicAtk: 430,
          def: 980,
          magicDef: 765,
          spd: 144,
          accRating: 88,
          accuracyPct: 44,
          evaRating: 77,
          evasionPct: 33,
          critChancePct: 23.5,
        },
      }),
    ).toEqual({
      power: 9_876,
      maxHp: 3456,
      maxMp: 780,
      atk: 1200,
      magicAtk: 430,
      def: 980,
      magicDef: 765,
      spd: 144,
      accuracy: 88,
      evasion: 77,
      crit: 23.5,
    });

    expect(
      loadoutStatSnapshot({
        character: { maxHp: Number.NaN, maxMp: Number.POSITIVE_INFINITY },
        combat: {
          atk: 10,
          def: Number.NaN,
          spd: 20,
          accuracyPct: 31,
          evasionPct: 42,
        },
      }),
    ).toEqual({ atk: 10, spd: 20, accuracy: 31, evasion: 42 });
    expect(loadoutStatSnapshot({ combat: null })).toBeNull();
  });
});

describe("diffLoadoutStats", () => {
  it("양쪽 스냅샷에 있는 값의 0이 아닌 증감만 반환한다", () => {
    expect(
      diffLoadoutStats(
        { atk: 100, def: 80, spd: 30, magicAtk: 20 },
        { atk: 115, def: 72, spd: 30, crit: 5 },
      ),
    ).toEqual({ atk: 15, def: -8 });
  });
});

describe("LoadoutStatSummary", () => {
  it("변경된 값은 이전값·현재값·증감을, 비율은 퍼센트로 표시한다", () => {
    const html = renderToStaticMarkup(
      <LoadoutStatSummary
        current={{ def: 1250, crit: 23.5 }}
        delta={{ def: 125 }}
      />,
    );

    expect(html).toContain("주요 능력치");
    expect(html).toContain("방어력");
    expect(html).toContain("1,125 → 1,250");
    expect(html).toContain("+125");
    expect(html).toContain("23.5%");
  });

  it("확정된 변경에서 표시 능력치가 그대로면 이를 명시한다", () => {
    const html = renderToStaticMarkup(
      <LoadoutStatSummary current={{ atk: 100 }} delta={{}} />,
    );

    expect(html).toContain("주요 능력치 변동 없음");
    expect(html).toContain("스킬 고유 효과는 설명대로 적용됩니다");
  });
});

describe("LoadoutStatResponsiveLayout", () => {
  it("모바일 접이식 요약과 데스크톱 고정 요약을 모두 제공한다", () => {
    const html = renderToStaticMarkup(
      <LoadoutStatResponsiveLayout current={{ atk: 100 }} delta={null}>
        <div>스킬 목록</div>
      </LoadoutStatResponsiveLayout>,
    );

    expect(html).toContain("<details");
    expect(html).toContain("<aside");
    expect(html).toContain("lg:hidden");
    expect(html).toContain(
      "sticky top-[calc(var(--game-header-height,4rem)+0.75rem)] hidden lg:block",
    );
    expect(html).toContain("스킬 목록");
  });
});
