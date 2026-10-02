import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { V2CharacterBasics } from "./V2CharacterBasics";

const BASE_PROPS = {
  points: 10,
  battleCount: 20,
  power: 3_000,
};

describe("V2CharacterBasics 성장 방향 안내", () => {
  it("불일치 안내가 있으면 불투명 강조 패널에 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2CharacterBasics
        {...BASE_PROPS}
        buildAdvisory={{
          focus: "magic",
          issues: ["growth", "job"],
          message:
            "현재 주 공격은 마법 중심이지만 성장 능력치와 직업 보너스가 물리 계열에 치우쳐 있습니다.",
        }}
      />,
    );

    expect(html).toContain("세팅 방향 확인");
    expect(html).toContain("현재 주 공격은 마법 중심");
    expect(html).toContain("bg-amber-50");
    expect(html).not.toContain("bg-amber-50/");
  });

  it("안내가 없으면 경고 영역을 만들지 않는다", () => {
    const html = renderToStaticMarkup(<V2CharacterBasics {...BASE_PROPS} />);
    expect(html).not.toContain("세팅 방향 확인");
    expect(html).toContain("스탯 합계");
    expect(html).toContain("3,000");
    expect(html).not.toContain("전투력");
  });
  it("소속 길드·전투 횟수·숙달 포인트를 상자 대신 라벨과 값의 행으로 보여 준다", () => {
    const html = renderToStaticMarkup(
      <V2CharacterBasics {...BASE_PROPS} battleCount={1_234} guildName={null} />,
    );

    expect(html).toContain("<dl");
    expect(html.split("<dt").length - 1).toBe(3);
    expect(html).toContain("divide-y");
    expect(html).not.toContain("rounded-md border border-zinc-200 bg-zinc-50");
    expect(html).toContain("무소속");
    expect(html).toContain("1,234");
  });
});
