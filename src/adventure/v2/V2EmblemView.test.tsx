// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { V2EmblemView } from "./V2EmblemView";
import { V2CharacterMenu } from "./V2CharacterMenu";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const fetchMock = vi.fn();
const initial = { owned: [{ iid: "a", kind: "hp", grade: 1 }, { iid: "b", kind: "hp", grade: 1 }], slots: ["a", null, null, null], revision: 4 };
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, emblems: initial }) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("emblem screen", () => {
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
