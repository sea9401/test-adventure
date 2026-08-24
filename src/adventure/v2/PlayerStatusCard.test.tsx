import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlayerStatusCard } from "./PlayerStatusCard";

const combat = {
  atk: 1_628,
  magicAtk: 2_345,
  def: 416,
  spd: 684,
};

describe("player status card combat summary", () => {
  it("물리형 전투 수치를 약어가 아닌 전체 이름으로 표시한다", () => {
    const html = renderToStaticMarkup(
      <PlayerStatusCard
        gender="male1"
        name="폴라"
        combat={combat}
        primaryAttack="physical"
      />,
    );

    expect(html).toContain("물리 공격력");
    expect(html).toContain("방어력");
    expect(html).toContain("속도");
    expect(html).not.toContain(">힘<");
    expect(html).not.toContain(">방<");
    expect(html).not.toContain(">속<");
  });

  it("마법형은 마법 공격력으로 표시한다", () => {
    const html = renderToStaticMarkup(
      <PlayerStatusCard
        gender="female1"
        name="마법사"
        combat={combat}
        primaryAttack="magic"
      />,
    );

    expect(html).toContain("마법 공격력");
    expect(html).toContain("2,345");
    expect(html).not.toContain(">마공<");
  });
});
