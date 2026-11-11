// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JOB_GOAL_STORAGE_KEY, LEGACY_JOB_GOAL_STORAGE_KEY } from "./jobExplorer";
import { V2JobLadder, type JobLadderEntry } from "./V2JobLadder";

const JOBS: JobLadderEntry[] = [
  { id: "warrior", name: "견습 병사", tier: 1, unlocked: true, condition: "Lv 100 달성" },
  { id: "mage", name: "견습 마법사", tier: 1, unlocked: true, condition: "Lv 100 달성" },
  { id: "archer", name: "견습 궁수", tier: 1, unlocked: true, condition: "Lv 100 달성" },
];

function renderLadder() {
  return render(
    <V2JobLadder
      level={100}
      currentJobName="모험가"
      currentJobId="none"
      atLevelCap
      revisitExpedited={false}
      rejobRequiredLevel={100}
      jobs={JOBS}
      onChanged={() => {}}
    />,
  );
}

function goalSectionNames(): string[] {
  const heading = screen.queryByRole("heading", { name: "목표 직업" });
  if (!heading) return [];
  const section = heading.closest("section")!;
  return within(section)
    .getAllByRole("listitem")
    .map((item) => JOBS.find((job) => item.textContent?.includes(job.name))?.id ?? "?")
    .sort();
}

function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest("li")!;
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("성장의 신전 목표 직업 여러 개", () => {
  it("저장된 목표 직업을 모두 목표 칸에 모은다", async () => {
    localStorage.setItem(JOB_GOAL_STORAGE_KEY, JSON.stringify(["mage", "archer"]));
    renderLadder();
    await waitFor(() => expect(goalSectionNames()).toEqual(["archer", "mage"]));
  });

  it("다른 직업에 별을 찍어도 기존 목표가 풀리지 않는다", async () => {
    localStorage.setItem(JOB_GOAL_STORAGE_KEY, JSON.stringify(["mage"]));
    renderLadder();
    await waitFor(() => expect(goalSectionNames()).toEqual(["mage"]));

    fireEvent.click(within(rowOf("견습 병사")).getByRole("button", { name: "목표로 설정" }));

    await waitFor(() => expect(goalSectionNames()).toEqual(["mage", "warrior"]));
    expect(JSON.parse(localStorage.getItem(JOB_GOAL_STORAGE_KEY)!)).toEqual(["mage", "warrior"]);

    fireEvent.click(within(rowOf("견습 마법사")).getByRole("button", { name: "목표 해제" }));
    await waitFor(() => expect(goalSectionNames()).toEqual(["warrior"]));
    expect(JSON.parse(localStorage.getItem(JOB_GOAL_STORAGE_KEY)!)).toEqual(["warrior"]);
  });

  it("예전에 찍어 둔 목표 하나를 그대로 이어받는다", async () => {
    localStorage.setItem(LEGACY_JOB_GOAL_STORAGE_KEY, "archer");
    renderLadder();
    await waitFor(() => expect(goalSectionNames()).toEqual(["archer"]));

    fireEvent.click(within(rowOf("견습 병사")).getByRole("button", { name: "목표로 설정" }));
    await waitFor(() => expect(goalSectionNames()).toEqual(["archer", "warrior"]));
    expect(localStorage.getItem(LEGACY_JOB_GOAL_STORAGE_KEY)).toBeNull();
  });
});
