// @vitest-environment jsdom
import { readFileSync } from "node:fs";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { battlePrepCraftRows } from "@/adventure/data/v2/battlePrep";

import { BattlePrepCraftPanel } from "./BattlePrepCraftPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CONTEXT = {
  levels: { mining: 25, woodcutting: 100 },
  masterCraft: { mining: false, woodcutting: false },
};

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => handler(url, init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function row(name: string) {
  return screen.getByText(name).closest("li") as HTMLElement;
}

describe("생활 공방 전투 준비물 패널", () => {
  it("서버 전용 요리 카탈로그로 이어지는 lifeMajor 모듈을 화면에서 import하지 않는다", () => {
    // lifeMajor.ts → cooking/state → cooking/catalog("server-only") 경로라 클라이언트 번들에 넣으면 빌드가 깨진다.
    const source = readFileSync("src/adventure/v2/BattlePrepCraftPanel.tsx", "utf8");
    expect(source).not.toMatch(/from "@\/adventure\/v2\/lifeMajor"/);
    expect(source).not.toMatch(/from "\.\/lifeMajor"/);
  });

  it("칸별로 8행을 보여 주고 막힌 이유와 재료 보유량을 알려 준다", async () => {
    stubFetch(() =>
      json({ ok: true, rows: battlePrepCraftRows({ materials: { v2_processed_softwood: 95 }, ...CONTEXT }) }),
    );
    render(<BattlePrepCraftPanel busy={false} onNotice={vi.fn()} />);

    await screen.findByText("초급 보강재");
    expect(screen.getByRole("heading", { name: "전투 준비물" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "무기 손질" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "방어구 손질" })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(row("상급 숫돌").textContent).toContain("채광 Lv.35부터 제작할 수 있습니다.");
    expect(row("명장의 보강재").textContent).toContain("벌목 주전공 명장 3단계부터 제작할 수 있습니다.");
    expect(row("초급 보강재").textContent).toContain("다듬은 목재 95/40");
    expect(row("초급 보강재").textContent).toContain("방어력·마법방어력 +20 · 최대 HP +300 · 12시간");
    expect(row("중급 보강재").textContent).toContain("재료가 부족합니다.");
  });

  it("제작하면 POST를 보내고 응답 행으로 갱신하며 알림을 올린다", async () => {
    const before = battlePrepCraftRows({ materials: { v2_processed_softwood: 95 }, ...CONTEXT });
    const after = battlePrepCraftRows({ materials: { v2_processed_softwood: 15, v2_prep_brace_1: 2 }, ...CONTEXT });
    const fetchMock = stubFetch((_url, init) =>
      init?.method === "POST"
        ? json({ ok: true, itemId: "v2_prep_brace_1", crafted: 2, rows: after })
        : json({ ok: true, rows: before }),
    );
    const onNotice = vi.fn();
    render(<BattlePrepCraftPanel busy={false} onNotice={onNotice} />);
    await screen.findByText("초급 보강재");

    fireEvent.click(within(row("초급 보강재")).getByRole("button", { name: "최대 2개" }));
    fireEvent.click(screen.getByRole("button", { name: "최대 2개 제작" }));

    await waitFor(() => expect(onNotice).toHaveBeenCalledWith("초급 보강재 2개를 완성했습니다."));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("/api/v2/life-workshop/battle-prep");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ itemId: "v2_prep_brace_1", quantity: 2 });
    expect(row("초급 보강재").textContent).toContain("보유 2");
    expect(row("초급 보강재").textContent).toContain("다듬은 목재 15/40");
  });

  it("서버 오류 코드를 문구로 바꾼다", async () => {
    const rows = battlePrepCraftRows({ materials: { v2_processed_softwood: 40 }, ...CONTEXT });
    stubFetch((_url, init) =>
      init?.method === "POST" ? json({ ok: false, error: "not_enough_materials" }, 409) : json({ ok: true, rows }),
    );
    const onNotice = vi.fn();
    render(<BattlePrepCraftPanel busy={false} onNotice={onNotice} />);
    await screen.findByText("초급 보강재");

    fireEvent.click(within(row("초급 보강재")).getByRole("button", { name: "1개" }));

    await waitFor(() => expect(onNotice).toHaveBeenCalledWith("재료가 부족합니다."));
  });

  it("불러오지 못하면 다시 시도할 수 있다", async () => {
    stubFetch(() => json({ ok: false }, 500));
    render(<BattlePrepCraftPanel busy={false} onNotice={vi.fn()} />);

    expect(await screen.findByRole("button", { name: /다시/ })).toBeTruthy();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
