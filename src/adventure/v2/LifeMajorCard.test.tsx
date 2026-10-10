// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeMajorView } from "./lifeMajor";
import { LifeMajorBadge } from "./LifeMajorBadge";
import { LifeMajorCard } from "./LifeMajorCard";

const NOW = Date.parse("2026-10-11T12:00:00+09:00");

function activity(id: LifeMajorView["activities"][number]["id"], name: string, overrides: Partial<LifeMajorView["activities"][number]> = {}) {
  return {
    id,
    name,
    level: 100,
    eligible: true,
    role: null,
    masteryXp: 0,
    stage: 0,
    stageXpInto: 0,
    stageXpForNext: 1000,
    capped: false,
    effectText: null,
    productName: id === "cooking" ? null : `명장 ${name}`,
    productChancePct: 0,
    ...overrides,
  };
}

function view(overrides: Partial<LifeMajorView> = {}): LifeMajorView {
  return {
    major: null,
    minor: null,
    nextChangeAt: null,
    crafting: { catalystUnlocked: false, requiredStage: 3, alloy: 0, wood: 0, catalysts: 0 },
    activities: [
      activity("farming", "농사"),
      activity("woodcutting", "벌목", { level: 62, eligible: false }),
      activity("mining", "채광"),
      activity("fishing", "낚시"),
      activity("cooking", "요리", { level: 40, eligible: false }),
    ],
    ...overrides,
  };
}

let current: LifeMajorView;
let posted: unknown[];

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  current = view();
  posted = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/v2/life-major/catalyst") {
        const body = JSON.parse(String(init?.body));
        posted.push({ catalyst: body });
        current = { ...current, crafting: { ...current.crafting, alloy: 0, wood: 0, catalysts: body.quantity } };
        return new Response(JSON.stringify({ ok: true, crafted: body.quantity, view: current }), { status: 200 });
      }
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        posted.push(body);
        current = view({ major: body.major, minor: body.minor });
        return new Response(JSON.stringify({ ok: true, view: current }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, ...current }), { status: 200 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("생활 전공 카드", () => {
  it("Lv.100 생활이 없으면 잠금 안내를 보여 준다", async () => {
    current = view({
      activities: view().activities.map((entry) => ({ ...entry, level: 70, eligible: false })),
    });
    render(<LifeMajorCard />);
    await screen.findByText(/Lv\.100을 달성한 생활이 생기면/);
    expect(screen.queryByRole("button", { name: "전공 저장" })).toBeNull();
  });

  it("Lv.100 생활만 고를 수 있고 처음 지정은 바로 저장한다", async () => {
    render(<LifeMajorCard />);
    const major = (await screen.findByLabelText("주전공")) as HTMLSelectElement;
    const options = Array.from(major.options).map((option) => option.textContent);
    expect(options).toEqual(["선택 안 함", "농사", "채광", "낚시"]);
    fireEvent.change(major, { target: { value: "mining" } });
    fireEvent.change(screen.getByLabelText("부전공"), { target: { value: "farming" } });
    fireEvent.click(screen.getByRole("button", { name: "전공 저장" }));
    await waitFor(() => expect(posted).toEqual([{ major: "mining", minor: "farming" }]));
  });

  it("변경 대기 중이면 다음 변경 시각을 보여 주고 저장 버튼을 막는다", async () => {
    current = view({ major: "farming", nextChangeAt: NOW + 3 * 86_400_000 });
    render(<LifeMajorCard />);
    await screen.findByText(/다음 변경 가능/);
    fireEvent.change(screen.getByLabelText("주전공"), { target: { value: "mining" } });
    expect((screen.getByRole("button", { name: "전공 저장" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("전공 생활의 명장 단계와 효과·산물 확률을 보여 준다", async () => {
    current = view({
      major: "mining",
      activities: view().activities.map((entry) =>
        entry.id === "mining"
          ? { ...entry, role: "major" as const, stage: 3, effectText: "추가 광석 확률 +3%p", productChancePct: 0.95 }
          : entry,
      ),
    });
    const { container } = render(<LifeMajorCard />);
    await screen.findByText("명장 3단계");
    expect(screen.getByText("추가 광석 확률 +3%p")).toBeTruthy();
    expect(screen.getByText(/명장 채광 확률 0\.95%/)).toBeTruthy();
    expect(container.innerHTML).toContain("ui-surface-card");
    expect(container.innerHTML).not.toMatch(/bg-[a-z]+-\d+\/\d+/);
  });
});

describe("단련 촉매 제작", () => {
  it("채광 주전공 3단계 이상이면 재료와 함께 제작 버튼을 보여 준다", async () => {
    current = view({
      major: "mining",
      crafting: { catalystUnlocked: true, requiredStage: 3, alloy: 4, wood: 1, catalysts: 0 },
    });
    render(<LifeMajorCard />);
    await screen.findByText("단련 촉매");
    expect(screen.getByText("명장 합금 4 · 명장 목재 1 · 보유 촉매 0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "1개 만들기" }));
    await waitFor(() => expect(posted).toEqual([{ catalyst: { quantity: 1 } }]));
    await screen.findByText("명장 합금 0 · 명장 목재 0 · 보유 촉매 1");
  });

  it("재료가 모자라면 버튼을 막고, 조건 미달이면 행을 숨긴다", async () => {
    current = view({
      major: "mining",
      crafting: { catalystUnlocked: true, requiredStage: 3, alloy: 1, wood: 1, catalysts: 0 },
    });
    render(<LifeMajorCard />);
    expect(((await screen.findByRole("button", { name: "1개 만들기" })) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    current = view({ major: "mining" });
    render(<LifeMajorCard />);
    await screen.findByText("생활 전공");
    expect(screen.queryByText("단련 촉매")).toBeNull();
  });
});

describe("활동 화면 전공 표시", () => {
  it("전공 생활이면 역할과 명장 단계를 한 줄로 보여 준다", async () => {
    current = view({
      major: "mining",
      activities: view().activities.map((entry) =>
        entry.id === "mining" ? { ...entry, role: "major" as const, stage: 3, effectText: "추가 광석 확률 +3%p" } : entry,
      ),
    });
    render(<LifeMajorBadge activity="mining" />);
    await screen.findByText(/주전공 · 명장 3단계/);
  });

  it("전공이 아니면 그리지 않는다", async () => {
    const { container } = render(<LifeMajorBadge activity="farming" />);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });
});
