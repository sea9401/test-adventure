import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HuntEntryCard, SCENE_STRIP_CLASS } from "./HuntEntryCard";

const NOW = 1_800_000_000_000;

function render() {
  return renderToStaticMarkup(
    <HuntEntryCard
      stamina={{ current: 1840, lastUpdatedAt: NOW }}
      staminaMax={3000}
      now={NOW}
    />,
  );
}

describe("모험 홈 사냥터 카드", () => {
  it("사냥터로 가는 주 행동 하나와 지금 스태미너를 보여 준다", () => {
    const html = render();

    expect(html).toContain('href="/battle/dungeon"');
    expect(html).toContain("사냥하러 가기");
    expect(html).toContain("bg-primary");
    expect(html).toContain("1,840 / 3,000");
  });

  it("사냥터 그림은 장식이라 대체 문구 없이 띠로 넣는다", () => {
    const html = render();

    expect(html).toContain(SCENE_STRIP_CLASS);
    // 환경 설정에서 사냥터 그림을 끈 계정에서도 함께 숨는다.
    expect(html).toContain("ui-hunting-ground-image");
    expect(html).toContain('alt=""');
    expect(html).toContain("plains.webp");
  });

  it("은신 모드와 터미널 모드에서는 그림 띠를 숨긴다", () => {
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(css).toMatch(
      /html\.ui-discreet-mode \.ui-scene-strip,\s*html\.ui-terminal-mode \.ui-scene-strip\s*\{\s*display: none;/,
    );
  });
});
