import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EnhanceCandidateFilters } from "./EnhanceCandidateFilters";

const noop = () => undefined;

function render(overrides: Partial<Parameters<typeof EnhanceCandidateFilters>[0]> = {}) {
  return renderToStaticMarkup(
    <EnhanceCandidateFilters
      filter={{ search: "", lock: "all", tier: "all" }}
      onChange={noop}
      tierOptions={[
        { tier: 4, count: 3 },
        { tier: 1, count: 12 },
      ]}
      totalCount={15}
      lockedCount={5}
      {...overrides}
    />,
  );
}

describe("EnhanceCandidateFilters", () => {
  it("이름 검색, 보유 티어 선택, 잠금 보기를 한 번에 보여 준다", () => {
    const html = render();
    expect(html).toContain('aria-label="강화 장비 검색"');
    expect(html).toContain('aria-label="강화 장비 티어"');
    expect(html).toContain("모든 티어 (15)");
    expect(html).toContain("4티어 (3)");
    expect(html).toContain("1티어 (12)");
    expect(html).not.toContain("2티어");
    expect(html).toContain("잠금만 보기 (5)");
  });

  it("미잠금만 보는 중이면 미잠금 장비 개수를 보여 준다", () => {
    expect(render({ filter: { search: "", lock: "unlocked", tier: "all" } })).toContain(
      "미잠금만 보기 (10)",
    );
  });
});
