// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { buildJobCodex } from "@/adventure/data/v2/v2JobCodex";
import type { JobCodex } from "@/adventure/data/v2/v2JobCodex";
import { emptyProficiency } from "@/adventure/data/v2/proficiency";
import {
  JobCodexList,
  jobCodexSectionExpanded,
} from "./V2JobCodexView";

const CODEX = buildJobCodex(emptyProficiency(), [], "warrior", null);

afterEach(cleanup);

describe("JobCodexList 모바일 터치 영역", () => {
  it("검색 숫자를 도감에 포함된 직업 수로 안내한다", () => {
    const compactCodex: JobCodex = {
      currentJobId: "warrior",
      totalJobs: 1,
      jobs: [{
        id: "warrior",
        name: "견습 병사",
        tier: 1,
        unlocked: true,
        isCurrent: true,
        mastery: 0,
        condition: "Lv 100 달성",
        conditionRevealed: true,
        skillsLearned: 0,
        skillsTotal: 2,
      }],
    };

    const html = renderToStaticMarkup(<JobCodexList codex={compactCodex} />);

    expect(html).toContain("도감 직업 1개");
  });

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

describe("JobCodexList 카드 밀도", () => {
  it("직업명·수집 배지·카테고리를 헤더에, 숙련도·해금 조건을 한 행에 표시한다", () => {
    const compactCodex: JobCodex = {
      currentJobId: "beastkin",
      totalJobs: 1,
      jobs: [
        {
          id: "beastkin",
          name: "수인",
          tier: 1,
          unlocked: true,
          isCurrent: true,
          mastery: 1_000,
          condition: "변이자 숙련도 1000",
          conditionRevealed: true,
          skillsLearned: 2,
          skillsTotal: 2,
        },
      ],
    };

    render(<JobCodexList codex={compactCodex} />);

    const cardHeader = screen.getByText("수인").closest("header");
    expect(cardHeader).not.toBeNull();
    expect(within(cardHeader!).getByText("수집 완료")).toBeTruthy();
    expect(
      within(cardHeader!).getByRole("list", { name: "수인 카테고리" }),
    ).toBeTruthy();

    const mastery = screen.getByText("숙련도 1,000");
    const condition = screen.getByText("해금 · 변이자 숙련도 1000");
    expect(mastery.parentElement).toBe(condition.parentElement);
  });
});
