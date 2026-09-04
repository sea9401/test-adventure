// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { JobManualIndexEntry } from "../jobManualModel";
import { JobWikiIndex, filterJobManualIndex } from "./JobWikiIndex";

const ENTRIES: JobManualIndexEntry[] = [
  {
    id: "primordialmage",
    name: "태초술사",
    tier: 6,
    kind: "combat",
    line: "mage",
    lineLabel: "마법사",
    primaryStats: ["지능", "정신"],
    skillNames: ["태초회귀", "근원공명"],
    searchText: "primordialmage 태초술사 마법사 지능 정신 태초회귀 근원공명",
  },
  {
    id: "templar",
    name: "성기사",
    tier: 3,
    kind: "combat",
    line: "hybrid",
    lineLabel: "복합",
    primaryStats: ["힘", "활력", "정신"],
    skillNames: ["심판의 빛"],
    searchText: "templar 성기사 복합 힘 활력 정신 심판의 빛",
  },
  {
    id: "fisher",
    name: "낚시꾼",
    tier: 2,
    kind: "life",
    line: "survivor",
    lineLabel: "생존자",
    primaryStats: ["민첩", "행운"],
    skillNames: ["물때 읽기"],
    searchText: "fisher 낚시꾼 생존자 민첩 행운 물때 읽기",
  },
];

const PAGINATED_ENTRIES: JobManualIndexEntry[] = Array.from(
  { length: 13 },
  (_, index) => ({
    ...ENTRIES[0],
    id: `job-${index + 1}`,
    name: `직업 ${index + 1}`,
    searchText: `job-${index + 1} 직업 ${index + 1} 마법사`,
  }),
);

afterEach(cleanup);

describe("job wiki index", () => {
  it("searches skill names and intersects kind filters", () => {
    expect(
      filterJobManualIndex(ENTRIES, {
        query: "태초회귀",
        kind: "all",
        line: "all",
        tier: "all",
      }).map((job) => job.id),
    ).toEqual(["primordialmage"]);
    expect(
      filterJobManualIndex(ENTRIES, {
        query: "",
        kind: "life",
        line: "all",
        tier: "all",
      }).map((job) => job.id),
    ).toEqual(["fisher"]);
    expect(
      filterJobManualIndex(ENTRIES, {
        query: "태초",
        kind: "life",
        line: "all",
        tier: "all",
      }),
    ).toEqual([]);
  });

  it("renders accessible controls and updates the visible result count", () => {
    render(<JobWikiIndex entries={ENTRIES} />);

    expect(screen.getByLabelText("직업 또는 스킬 검색")).toBeDefined();
    expect(screen.getByRole("group", { name: "직업 종류" })).toBeDefined();
    expect(screen.getByRole("group", { name: "직군" })).toBeDefined();
    expect(screen.getByRole("group", { name: "차수" })).toBeDefined();
    expect(screen.getByText("3개 중 3개")).toBeDefined();
    expect(
      screen.getByRole("link", { name: /태초술사/ }).getAttribute("href"),
    ).toBe("/manual/jobs/primordialmage");

    fireEvent.change(screen.getByLabelText("직업 또는 스킬 검색"), {
      target: { value: "태초회귀" },
    });

    expect(screen.getByText("3개 중 1개")).toBeDefined();
    expect(screen.queryByRole("link", { name: /성기사/ })).toBeNull();
  });

  it("shows a recoverable empty state", () => {
    render(<JobWikiIndex entries={ENTRIES} />);

    fireEvent.change(screen.getByLabelText("직업 또는 스킬 검색"), {
      target: { value: "없는 직업" },
    });

    expect(screen.getByText("검색 조건에 맞는 직업이 없습니다.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
    expect(screen.getByText("3개 중 3개")).toBeDefined();
  });

  it("shows twelve filtered jobs per page with bounded navigation", () => {
    render(<JobWikiIndex entries={PAGINATED_ENTRIES} />);

    expect(screen.getAllByRole("link")).toHaveLength(12);
    expect(screen.getByRole("link", { name: /^직업 16차/ })).toBeDefined();
    expect(screen.queryByRole("link", { name: /^직업 136차/ })).toBeNull();
    expect(screen.getByText("1 / 2 페이지")).toBeDefined();
    expect(
      (screen.getByRole("button", { name: "이전 페이지" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /^직업 16차/ })).toBeNull();
    expect(screen.getByRole("link", { name: /^직업 136차/ })).toBeDefined();
    expect(screen.getByText("2 / 2 페이지")).toBeDefined();
    expect(
      (screen.getByRole("button", { name: "다음 페이지" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("returns to page one when search filters change", () => {
    render(<JobWikiIndex entries={PAGINATED_ENTRIES} />);

    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    expect(screen.getByText("2 / 2 페이지")).toBeDefined();

    fireEvent.change(screen.getByLabelText("직업 또는 스킬 검색"), {
      target: { value: "직업" },
    });

    expect(screen.getByText("1 / 2 페이지")).toBeDefined();
    expect(screen.getByRole("link", { name: /^직업 16차/ })).toBeDefined();
    expect(screen.queryByRole("link", { name: /^직업 136차/ })).toBeNull();
  });
});
