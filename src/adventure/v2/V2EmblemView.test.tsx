// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { EmblemState } from "@/adventure/data/v2/emblems";
import { V2EmblemView } from "./V2EmblemView";
import { V2CharacterMenu } from "./V2CharacterMenu";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const fetchMock = vi.fn();
const initial = { owned: [{ iid: "a", kind: "hp", grade: 1 }, { iid: "b", kind: "hp", grade: 1 }], slots: ["a", null, null, null], revision: 4 };
const mixed: EmblemState = {
  owned: [
    { iid: "str", kind: "str", grade: 2 },
    { iid: "hp-low", kind: "hp", grade: 1 },
    { iid: "mp", kind: "mp", grade: 5 },
    { iid: "hp-high", kind: "hp", grade: 3 },
    { iid: "hp-copy", kind: "hp", grade: 3 },
    { iid: "luk", kind: "luk", grade: 4 },
  ],
  slots: ["str", "hp-low", "mp", "hp-high"],
  revision: 7,
};

function respondWith(emblems: EmblemState) {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, emblems }) });
}

function inventoryHeadings() {
  return within(screen.getByRole("region", { name: "보유 문장" }))
    .getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
}
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, emblems: initial }) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("emblem screen", () => {
  it("defaults to kind and high grade order, and switches sorting without renumbering items", async () => {
    respondWith(mixed);
    render(<V2EmblemView />);
    await screen.findByRole("region", { name: "보유 문장" });
    expect(inventoryHeadings()).toEqual([
      "HP 문장 · 3등급", "HP 문장 · 3등급", "HP 문장 · 1등급",
      "MP 문장 · 5등급", "힘 문장 · 2등급", "행운 문장 · 4등급",
    ]);

    const sort = screen.getByRole("combobox", { name: "문장 정렬" });
    expect((sort as HTMLSelectElement).value).toBe("kind");
    fireEvent.change(sort, { target: { value: "grade" } });
    expect(inventoryHeadings()).toEqual([
      "MP 문장 · 5등급", "행운 문장 · 4등급", "HP 문장 · 3등급",
      "HP 문장 · 3등급", "힘 문장 · 2등급", "HP 문장 · 1등급",
    ]);
    const inventory = within(screen.getByRole("region", { name: "보유 문장" }));
    expect(inventory.getAllByRole("button", { name: /^문장 \d+ 장착$/ })
      .map((button) => button.getAttribute("aria-label"))).toEqual([
      "문장 3 장착", "문장 6 장착", "문장 4 장착", "문장 5 장착", "문장 1 장착", "문장 2 장착",
    ]);

    fireEvent.change(sort, { target: { value: "acquired" } });
    expect(inventoryHeadings()).toEqual([
      "힘 문장 · 2등급", "HP 문장 · 1등급", "MP 문장 · 5등급",
      "HP 문장 · 3등급", "HP 문장 · 3등급", "행운 문장 · 4등급",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("identifies all four equipped instances beside their names, including duplicate kinds", async () => {
    respondWith(mixed);
    render(<V2EmblemView />);
    const inventory = within(await screen.findByRole("region", { name: "보유 문장" }));
    const headings = inventory.getAllByRole("heading", { level: 3 });
    const badges = inventory.getAllByText(/^장착 중 · 슬롯 [1-4]$/);
    expect(badges).toHaveLength(4);
    expect(headings[0].parentElement?.textContent).toContain("장착 중 · 슬롯 4");
    expect(headings[1].parentElement?.textContent).not.toContain("장착 중");
    expect(headings[2].parentElement?.textContent).toContain("장착 중 · 슬롯 2");
    expect(headings[3].parentElement?.textContent).toContain("장착 중 · 슬롯 3");
    expect(headings[4].parentElement?.textContent).toContain("장착 중 · 슬롯 1");
    expect(headings[5].parentElement?.textContent).not.toContain("장착 중");
  });

  it("equips the sorted instance and refreshes its badge after replacement and unequip", async () => {
    respondWith(mixed);
    render(<V2EmblemView />);
    const sort = await screen.findByRole("combobox", { name: "문장 정렬" });
    fireEvent.change(sort, { target: { value: "grade" } });
    fireEvent.click(screen.getByRole("button", { name: "슬롯 4 선택" }));
    const equipped = { ...mixed, slots: ["str", "hp-low", "mp", "hp-copy"], revision: 8 };
    respondWith(equipped);
    fireEvent.click(screen.getByRole("button", { name: "문장 5 장착" }));
    await screen.findByText(/문장을 장착했습니다/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      action: "equip", iid: "hp-copy", slot: 3, expectedRevision: 7,
    });
    expect((sort as HTMLSelectElement).value).toBe("grade");
    const inventory = within(screen.getByRole("region", { name: "보유 문장" }));
    const hpHeadings = inventory.getAllByRole("heading", { name: "HP 문장 · 3등급" });
    expect(hpHeadings[0].parentElement?.textContent).not.toContain("장착 중");
    expect(hpHeadings[1].parentElement?.textContent).toContain("장착 중 · 슬롯 4");
    expect((screen.getByRole("button", { name: "문장 5 장착" }) as HTMLButtonElement).disabled).toBe(true);

    respondWith({ ...equipped, slots: ["str", "hp-low", "mp", null], revision: 9 });
    fireEvent.click(screen.getByRole("button", { name: "슬롯 4 해제" }));
    await screen.findByText(/문장을 해제했습니다/);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      action: "unequip", slot: 3, expectedRevision: 8,
    });
    expect(inventory.queryByText("장착 중 · 슬롯 4")).toBeNull();
    expect((sort as HTMLSelectElement).value).toBe("grade");
  });

  it("preserves fusion target and material identities after sorting", async () => {
    respondWith(mixed);
    render(<V2EmblemView />);
    const sort = await screen.findByRole("combobox", { name: "문장 정렬" });
    fireEvent.change(sort, { target: { value: "grade" } });
    fireEvent.click(screen.getByRole("button", { name: "문장 4 합성 대상 선택" }));
    const materials = screen.getByRole("combobox", { name: "소모할 재료 문장" });
    expect(within(materials).getAllByRole("option").map((option) => option.textContent))
      .toEqual(["HP 문장 · 3등급 · 문장 5"]);

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({
      ok: true, success: true, emblems: {
        ...mixed,
        owned: mixed.owned.filter((item) => item.iid !== "hp-copy")
          .map((item) => item.iid === "hp-high" ? { ...item, grade: 4 } : item),
        revision: 8,
      },
    }) });
    fireEvent.click(screen.getByRole("button", { name: "합성 실행" }));
    await screen.findByText(/합성에 성공했습니다/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      action: "fuse", iid: "hp-high", materialIid: "hp-copy", expectedRevision: 7,
    });
    expect(inventoryHeadings()).toEqual([
      "MP 문장 · 5등급", "HP 문장 · 4등급", "행운 문장 · 4등급", "힘 문장 · 2등급", "HP 문장 · 1등급",
    ]);
    const inventory = within(screen.getByRole("region", { name: "보유 문장" }));
    expect(inventory.getByRole("heading", { name: "HP 문장 · 4등급" }).parentElement?.textContent)
      .toContain("장착 중 · 슬롯 4");
  });

  it("opens the emblem screen from the character menu", () => {
    const onAction = vi.fn();
    render(<V2CharacterMenu onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /문장/ }));
    expect(onAction).toHaveBeenCalledWith({ kind: "open-emblems" });
  });
  it("shows four slots and sends the selected slot with the current revision", async () => {
    render(<V2EmblemView />);
    const slots = await screen.findAllByRole("button", { name: /^슬롯 [1-4] 선택$/ });
    expect(slots).toHaveLength(4);
    fireEvent.click(slots[3]);
    fireEvent.click(screen.getByRole("button", { name: "문장 2 장착" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: "equip", iid: "b", slot: 3, expectedRevision: 4 });
  });
  it("requires explicit fusion confirmation and explains a failed fusion", async () => {
    render(<V2EmblemView />);
    fireEvent.click(await screen.findByRole("button", { name: "문장 1 합성 대상 선택" }));
    expect(screen.getByText(/실패해도 재료 문장은 소모/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, success: false, emblems: { ...initial, owned: [initial.owned[0]], revision: 5 } }) });
    fireEvent.click(screen.getByRole("button", { name: "합성 실행" }));
    expect(await screen.findByText(/합성에 실패했습니다/)).toBeTruthy();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: "fuse", iid: "a", materialIid: "b", expectedRevision: 4 });
    expect(screen.queryByRole("button", { name: "문장 2 장착" })).toBeNull();
  });
  it("handles loading failures with a retry instead of an empty inventory", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    render(<V2EmblemView />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(await screen.findByRole("button", { name: "문장 2 장착" })).toBeTruthy();
  });
});
