import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildJobCodex } from "@/adventure/data/v2/v2JobCodex";
import { emptyProficiency } from "@/adventure/data/v2/proficiency";
import {
  JobCodexList,
  jobCodexSectionExpanded,
} from "./V2JobCodexView";

const CODEX = buildJobCodex(emptyProficiency(), [], "warrior", null);

describe("JobCodexList 모바일 터치 영역", () => {
  it("검색 지우기와 목표 버튼에 44px 터치 영역을 제공한다", () => {
    const html = renderToStaticMarkup(<JobCodexList codex={CODEX} />);

    expect(html).toContain('aria-label="검색 지우기"');
    expect(html).toContain("h-11 w-11 sm:h-5 sm:w-5");
    expect(html).toContain("h-11 w-11 sm:h-8 sm:w-8");
  });

  it("필터 버튼은 모바일에서 최소 40px 높이를 확보한다", () => {
    const html = renderToStaticMarkup(<JobCodexList codex={CODEX} />);

    expect(html).toContain("h-10 sm:h-7");
  });
});

describe("JobCodexList 섹션 접기", () => {
  it("현재·목표는 기본으로 열고 긴 목록은 기본으로 닫는다", () => {
    expect(jobCodexSectionExpanded("goal", false, new Set())).toBe(true);
    expect(jobCodexSectionExpanded("current", false, new Set())).toBe(true);
    expect(jobCodexSectionExpanded("unlocked", false, new Set())).toBe(false);
    expect(jobCodexSectionExpanded("locked", false, new Set())).toBe(false);
  });

  it("검색이나 필터 중에는 결과 섹션을 강제로 연다", () => {
    expect(
      jobCodexSectionExpanded("locked", true, new Set(["locked"])),
    ).toBe(true);
  });

  it("해금 및 조건 부족 목록을 접힌 버튼으로 렌더한다", () => {
    const html = renderToStaticMarkup(<JobCodexList codex={CODEX} />);

    expect(html).toContain('aria-label="해금된 직업 펼치기"');
    expect(html).toContain('aria-label="조건 부족 펼치기"');
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(2);
    expect(html).toContain("min-h-10");
  });
});
