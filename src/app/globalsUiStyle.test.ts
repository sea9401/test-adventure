import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "globals.css"), "utf8");

function gildedLightBlock(): string {
  const start = css.indexOf(".ui-skin-gilded:not(.ui-terminal-mode) {");
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}

describe("금빛 화면 스타일 토큰", () => {
  it("라이트 포커스 링은 미색 바탕에서 3:1 이상 보이는 진한 금색을 쓴다", () => {
    // amber-500은 미색(#fdfbf7) 바탕에서 약 2.1:1이라 키보드 포커스가 잘 보이지 않는다.
    expect(gildedLightBlock()).toContain("--ui-focus: var(--color-amber-700);");
  });
});

describe("배경 숨김·은신 모드 바탕", () => {
  it("페이지 바탕은 화면 스타일이 다시 매핑하는 회색 변수를 따른다", () => {
    const light = css.slice(css.indexOf("html.ui-discreet-mode body {"));
    expect(light.slice(0, light.indexOf("}"))).toContain(
      "background-color: var(--color-zinc-100);",
    );
    const dark = css.slice(css.indexOf("html.dark.ui-discreet-mode body {"));
    expect(dark.slice(0, dark.indexOf("}"))).toContain(
      "background-color: var(--color-zinc-950);",
    );
  });
});
