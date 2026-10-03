import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 디자인 시스템 예산 — 화면마다 제각각이던 패턴이 더 늘지 않게 막는다.
//   화면을 고쳐 수가 줄면 아래 기준도 함께 낮춘다(늘리는 방향으로 고치지 않는다).
//   기준: 2026-10-03 화면 구성 개편 3단계(나머지 화면·PC 2단) 후 실측.
const BUDGET = {
  /** 색 바탕 + 흰 글자를 손으로 칠한 문자열. 주 행동은 Button/buttonClassName을 쓴다. */
  handPaintedButtons: 235,
  /** 12px 미만 글씨 클래스. 새 코드는 text-xs(12px) 이상을 쓴다. */
  tinyText: 1199,
};

const HAND_PAINTED =
  /["'`][^"'`]*\bbg-(?:emerald|green|orange|amber|sky|blue|indigo|violet|rose|red|teal|cyan|lime|fuchsia|pink|yellow)-(?:500|600|700)\b[^"'`]*\btext-white\b[^"'`]*["'`]/g;
const TINY_TEXT = /\btext-\[(?:9|10|11)px\]|\btext-\[0\.(?:5625|625|6875)rem\]/g;

function productionTsxFiles(root = "src"): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (path.replace(/\\/g, "/").startsWith("src/app/dev")) continue;
        walk(path);
      } else if (path.endsWith(".tsx") && !path.endsWith(".test.tsx")) {
        files.push(path);
      }
    }
  };
  walk(root);
  return files;
}

function count(pattern: RegExp): number {
  return productionTsxFiles().reduce(
    (total, file) => total + (readFileSync(file, "utf8").match(pattern)?.length ?? 0),
    0,
  );
}

describe("디자인 시스템 예산", () => {
  it("테스트와 /dev 미리보기 파일은 세지 않는다", () => {
    const files = productionTsxFiles();
    expect(files.some((file) => file.endsWith(".test.tsx"))).toBe(false);
    expect(files.some((file) => file.replace(/\\/g, "/").startsWith("src/app/dev"))).toBe(false);
  });

  it("손으로 색을 칠한 버튼이 늘지 않는다", () => {
    expect(count(HAND_PAINTED), "새 버튼은 Button 또는 buttonClassName을 쓰세요").toBeLessThanOrEqual(BUDGET.handPaintedButtons);
  });

  it("12px 미만 글씨가 늘지 않는다", () => {
    expect(count(TINY_TEXT), "새 글씨는 text-xs(12px) 이상을 쓰세요").toBeLessThanOrEqual(BUDGET.tinyText);
  });
});
