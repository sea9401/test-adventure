// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { EmblemState } from "@/adventure/data/v2/emblems";
import { V2EmblemView } from "./V2EmblemView";
import { V2CharacterMenu } from "./V2CharacterMenu";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const fetchMock = vi.fn();

const sample: EmblemState = {
  owned: [
    { iid: "str-2", kind: "str", grade: 2 },
    { iid: "hp-3", kind: "hp", grade: 3 },
    { iid: "dex-a", kind: "dex", grade: 1 },
    { iid: "dex-b", kind: "dex", grade: 1 },
    { iid: "dex-c", kind: "dex", grade: 1 },
  ],
  slots: ["str-2", "hp-3", null, null],
  revision: 7,
};

function respondWith(emblems: EmblemState, extra: Record<string, unknown> = {}) {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, emblems, ...extra }) });
}
function lastBody() {
  return JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("문장 화면", () => {
  it("맨 위에 장착한 문장으로 레벨업마다 얻는 능력치 합계를 보여 주고 규칙은 접어 둔다", async () => {
    respondWith(sample);
    render(<V2EmblemView />);

    const summary = await screen.findByRole("region", { name: "레벨업 성장 요약" });
    expect(summary.textContent).toContain("HP +0~10");
    expect(summary.textContent).toContain("힘 +0~2");
    const rules = summary.querySelector("details");
    expect(rules?.hasAttribute("open")).toBe(false);
    expect(rules?.textContent).toContain("이미 얻은 능력치는 해제해도 유지");
  });

  it("빈 칸을 누르면 그 칸에 넣을 문장을 고르고 현재 리비전과 함께 장착한다", async () => {
    respondWith(sample);
    render(<V2EmblemView />);

    fireEvent.click(await screen.findByRole("button", { name: "칸 3: 비어 있음" }));
    const picker = screen.getByRole("group", { name: "칸 3에 넣을 문장" });
    respondWith({ ...sample, slots: ["str-2", "hp-3", "dex-a", null], revision: 8 });
    fireEvent.click(within(picker).getByRole("button", { name: "민첩 1등급 장착" }));

    await screen.findByText(/문장을 장착했습니다/);
    expect(lastBody()).toEqual({ action: "equip", iid: "dex-a", slot: 2, expectedRevision: 7 });
    expect(screen.getByRole("button", { name: "칸 3: 민첩 1등급" })).toBeTruthy();
  });

  it("장착된 칸을 누르면 해제할 수 있다", async () => {
    respondWith(sample);
    render(<V2EmblemView />);

    fireEvent.click(await screen.findByRole("button", { name: "칸 1: 힘 2등급" }));
    respondWith({ ...sample, slots: [null, "hp-3", null, null], revision: 8 });
    fireEvent.click(screen.getByRole("button", { name: "칸 1 해제" }));

    await screen.findByText(/문장을 해제했습니다/);
    expect(lastBody()).toEqual({ action: "unequip", slot: 0, expectedRevision: 7 });
  });

  it("보유 문장은 같은 종류·등급을 개수로 묶고 합성 가능 여부를 표시한다", async () => {
    respondWith(sample);
    render(<V2EmblemView />);

    const inventory = await screen.findByRole("region", { name: "보유 문장" });
    const groups = within(inventory).getAllByRole("button", { name: /등급/ }).map((button) => button.textContent);
    expect(groups).toHaveLength(3);
    expect(within(inventory).getByRole("button", { name: /민첩 1등급.*3개/ }).textContent).toContain("합성 가능");
    expect(within(inventory).getByRole("button", { name: /HP 3등급.*1개/ }).textContent).toContain("장착");
  });

  it("묶음을 열면 성공률과 재료 소모를 보여 주고, 합성하기를 눌러야 합성한다", async () => {
    respondWith(sample);
    render(<V2EmblemView />);

    fireEvent.click(await screen.findByRole("button", { name: /민첩 1등급.*3개/ }));
    const detail = screen.getByRole("group", { name: "민첩 문장 1등급" });
    expect(detail.textContent).toContain("성공률 35%");
    expect(detail.textContent).toContain("실패해도 재료 문장 1개는 소모");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    respondWith({ ...sample, owned: sample.owned.filter((item) => item.iid !== "dex-b") }, { success: false });
    fireEvent.click(within(detail).getByRole("button", { name: "합성하기" }));

    const row = screen.getByRole("group", { name: "민첩 문장" });
    expect((await within(row).findByText(/합성에 실패했습니다/)).textContent).toContain("재료만 소모");
    expect(lastBody()).toEqual({ action: "fuse", iid: "dex-a", materialIid: "dex-b", expectedRevision: 7 });
  });

  it("묶음에서 원하는 칸을 골라 바로 장착할 수 있다", async () => {
    respondWith(sample);
    render(<V2EmblemView />);

    fireEvent.click(await screen.findByRole("button", { name: /민첩 1등급.*3개/ }));
    respondWith({ ...sample, slots: ["dex-a", "hp-3", null, null], revision: 8 });
    fireEvent.click(screen.getByRole("button", { name: "칸 1에 장착 (지금: 힘 2등급)" }));

    await screen.findByText(/문장을 장착했습니다/);
    expect(lastBody()).toEqual({ action: "equip", iid: "dex-a", slot: 0, expectedRevision: 7 });
  });

  it("칸 고르기와 묶음 상세는 한 번에 하나만 열린다", async () => {
    respondWith(sample);
    render(<V2EmblemView />);

    fireEvent.click(await screen.findByRole("button", { name: "칸 3: 비어 있음" }));
    fireEvent.click(screen.getByRole("button", { name: /민첩 1등급.*3개/ }));
    expect(screen.queryByRole("group", { name: "칸 3에 넣을 문장" })).toBeNull();
    expect(screen.getByRole("group", { name: "민첩 문장 1등급" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "칸 4: 비어 있음" }));
    expect(screen.queryByRole("group", { name: "민첩 문장 1등급" })).toBeNull();
    expect(screen.getByRole("group", { name: "칸 4에 넣을 문장" })).toBeTruthy();
  });

  it("불러오지 못하면 빈 목록 대신 다시 불러오기를 보여 준다", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, error: "rate_limited" }) });
    render(<V2EmblemView />);

    expect((await screen.findByRole("alert")).textContent).toContain("요청이 많습니다");
    respondWith(sample);
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    await screen.findByRole("region", { name: "보유 문장" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("캐릭터 메뉴에서 문장 화면으로 이동한다", () => {
    const onAction = vi.fn();
    render(<V2CharacterMenu onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /문장/ }));
    expect(onAction).toHaveBeenCalledWith({ kind: "open-emblems" });
  });
});
