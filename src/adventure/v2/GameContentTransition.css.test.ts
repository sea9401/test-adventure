import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function declarationsFor(selector: string) {
  const css = readFileSync("src/app/globals.css", "utf8");
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));

  if (!match) {
    throw new Error(`${selector} CSS 규칙을 찾을 수 없습니다.`);
  }

  const ruleBody = match[1].replace(/\/\*[\s\S]*?\*\//g, "");

  return Object.fromEntries(
    ruleBody
      .split(";")
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const separator = declaration.indexOf(":");
        return [
          declaration.slice(0, separator).trim(),
          declaration.slice(separator + 1).trim(),
        ];
      }),
  );
}

describe("사냥터 층 진입 전환 스타일", () => {
  it("애니메이션 종료 후 transform 합성 상태를 남기지 않는다", () => {
    const declarations = declarationsFor(".ui-hunt-floor-enter");

    expect(declarations.animation).toBe("ui-hunt-floor-enter 160ms ease-out");
    expect(declarations["animation-fill-mode"]).toBeUndefined();
    expect(declarations["will-change"]).toBeUndefined();
  });
});
