import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { V2CharacterMenu } from "./V2CharacterMenu";

describe("캐릭터 메뉴 전투 프리셋 진입", () => {
  it("스킬과 별도의 전투 프리셋 항목을 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2CharacterMenu onAction={() => undefined} />,
    );

    expect(html).toContain("스킬");
    expect(html).toContain("전투 프리셋");
    expect(html).not.toContain("스킬·전투패턴·장비를 한 번에 변경");
  });

  it("기능 플래그가 켜진 경우에만 개척 노드 진입을 표시한다", () => {
    const hidden = renderToStaticMarkup(
      <V2CharacterMenu onAction={() => undefined} unexploredEnabled={false} />,
    );
    const visible = renderToStaticMarkup(
      <V2CharacterMenu onAction={() => undefined} unexploredEnabled />,
    );

    expect(hidden).not.toContain("개척 노드");
    expect(visible).toContain("개척 노드");
    expect(visible).not.toContain(">미개척지<");
    expect(visible).not.toContain("탐사망을 조율하고 전용 사냥터를 강화");
  });
});
