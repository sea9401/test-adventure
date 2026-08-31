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
  });
});
