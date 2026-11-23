import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HuntEntryButton } from "./HuntEntryButton";

describe("모험 홈의 사냥터로 가기 버튼", () => {
  it("화면 폭을 채우는 큰 주 버튼 하나로 사냥터에 보낸다", () => {
    const html = renderToStaticMarkup(<HuntEntryButton />);

    expect(html).toContain('href="/battle/dungeon"');
    expect(html).toContain("사냥터로 가기");
    expect(html).toContain("bg-primary");
    expect(html).toContain("w-full");
    expect(html).toContain("min-h-14");
  });

  it("그림은 화면 배경에 있으므로 버튼에는 그림 띠를 넣지 않는다", () => {
    const html = renderToStaticMarkup(<HuntEntryButton />);

    expect(html).not.toContain("<img");
    expect(html).not.toContain("ui-scene-strip");
  });
});
