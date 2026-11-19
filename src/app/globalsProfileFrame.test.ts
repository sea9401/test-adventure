import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "globals.css"), "utf8");

describe("프사 테두리 꾸미기 색", () => {
  it("기본 색(프리즘)이 테두리 종류별 색을 덮지 않는다", () => {
    // 종류별 규칙(.ui-profile-frame-jade 등)이 먼저 선언되므로 기본값은 우선순위 0이어야 한다.
    expect(css).toMatch(
      /:where\(\.ui-profile-avatar-frame-cosmetic\) \{\s*--profile-frame-rgb: [^;]+;\s*--profile-frame-gradient:/,
    );
    const rule = /\n\.ui-profile-avatar-frame-cosmetic \{([^}]*)\}/.exec(css);
    expect(rule?.[1]).toBeTruthy();
    expect(rule?.[1]).not.toContain("--profile-frame-gradient:");
    expect(rule?.[1]).not.toContain("--profile-frame-rgb:");
  });
});
