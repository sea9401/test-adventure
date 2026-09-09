// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type { V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import { EquipmentLiberationPanel } from "./EquipmentLiberationPanel";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const source: V2EquipInstance = {
  iid: "source", id: "v2_boss_catastrophe_gloves", bound: true,
  liberation: { rank: 1, lineCount: 2, revision: 8, options: [
    { id: "base_str_pct", level: 12 }, { id: "skill_crit_damage_pp", level: 15 },
  ] },
};
const target: V2EquipInstance = { iid: "target", id: "v2_boss_catastrophe_gloves", enhance: { level: 5, bonusPct: 8 },
  liberation: { rank: 3, lineCount: 1, revision: 2, options: [{ id: "base_str_pct", level: 1 }] } };
const others: V2EquipInstance[] = [
  { iid: "armor", id: "v2_boss_frozen_lake_armor" },
  { iid: "low", id: "v2_iron_sword" },
  { iid: "refined", id: "v2_boss_catastrophe_gloves", stormRefined: true },
];
function Harness({ gold = 100_000_000 }: { gold?: number }) {
  const [items, setItems] = useState([source, target, ...others]);
  const [wallet, setWallet] = useState(gold);
  return <EquipmentLiberationPanel owned={items} equipped={{ gloves: source.iid }} gold={wallet} bankedGold={0} initialItemIid={source.iid}
    onItemUpdated={(updated) => setItems((current) => current.map((item) => item.iid === updated.iid ? updated : item))}
    onWalletUpdated={(nextGold) => setWallet(nextGold)} />;
}
function selectTarget() {
  fireEvent.click(screen.getByRole("button", { name: "마법부여 이전" }));
  fireEvent.click(screen.getByRole("button", { name: "받을 장비 선택" }));
  const picker = screen.getByRole("dialog", { name: "이전받을 장비 선택" });
  const options = within(within(picker).getByRole("listbox")).getAllByRole("option");
  expect(options).toHaveLength(1);
  fireEvent.click(options[0]);
}
function confirm() {
  fireEvent.click(screen.getByRole("button", { name: "이전 내용 확인" }));
  return screen.getByRole("dialog", { name: "마법부여 이전 확인" });
}
function successResponse() {
  const cleared = { ...source, liberation: undefined, liberationRevision: 9 };
  return Response.json({ ok: true, source: cleared, target: { ...target, bound: true, liberation: { ...source.liberation!, revision: 3 }, liberationRevision: 3 }, gold: 25_000_000, bankedGold: 0, spentGold: 75_000_000 });
}

describe("마법부여 이전 확인 흐름", () => {
  it("같은 부위의 적격 대상만 선택하고 전체 옵션·비용·소멸 안내를 확인한다", () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);
    selectTarget();
    const dialog = confirm();
    expect(within(dialog).getByText("마법부여 3단계 · 2줄")).toBeTruthy();
    expect(within(dialog).getByText(/기초 STR \+5.4%/)).toBeTruthy();
    expect(within(dialog).getByText(/스킬 치명타 피해 \+30%p/)).toBeTruthy();
    expect(within(dialog).getByText("Lv.12")).toBeTruthy();
    expect(within(dialog).getByText("Lv.15")).toBeTruthy();
    expect(within(dialog).getByText(/원본 장비와 귀속은 유지/)).toBeTruthy();
    expect(within(dialog).getByText(/기존 마법부여는 영구 소멸/)).toBeTruthy();
    expect(within(dialog).getByText(/즉시 귀속/)).toBeTruthy();
    expect(within(dialog).getByText(/기본 비용/).textContent).toContain("50,000,000");
    expect(within(dialog).getByText(/줄 수 추가 비용/).textContent).toContain("25,000,000");
    const cancel = within(dialog).getByRole("button", { name: "취소" });
    expect(document.activeElement).toBe(cancel);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(cancel);
    expect(screen.queryByRole("dialog", { name: "마법부여 이전 확인" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("금액을 확인한 실행만 요청하고 원본·대상·잔액을 함께 반영한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse()); vi.stubGlobal("fetch", fetchMock);
    render(<Harness />); selectTarget(); confirm();
    fireEvent.click(screen.getByRole("button", { name: "75,000,000 G 지불하고 이전" }));
    expect(await screen.findByText("마법부여 이전이 완료되었습니다.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ sourceIid: "source", targetIid: "target", expectedSourceRevision: 8, expectedTargetRevision: 2 });
    expect(screen.getByText("아직 마법부여되지 않은 장비")).toBeTruthy();
    expect(screen.getByText(/결제 가능 25,000,000 G/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /대상 장비 변경/ }));
    const picker = screen.getByRole("dialog", { name: "마법부여 장비 선택" });
    fireEvent.click(within(picker).getByRole("option", { name: /3단계 · 2줄/ }));
    expect(screen.getByText("마법부여 3단계 · 2줄")).toBeTruthy();
  });

  it("소지금과 은행 잔액이 부족하면 확인으로 진행하지 않는다", () => {
    render(<Harness gold={74_999_999} />); selectTarget();
    expect((screen.getByRole("button", { name: "이전 내용 확인" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("골드가 부족합니다.")).toBeTruthy();
  });

  it("응답 유실과 서버 오류 재시도는 같은 UUID를 유지하고 중복 클릭을 막는다", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(Response.json({ error: "server_error" }, { status: 500 }))
      .mockResolvedValueOnce(successResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />); selectTarget(); confirm();
    fireEvent.click(screen.getByRole("button", { name: "75,000,000 G 지불하고 이전" }));
    await screen.findByText(/연결을 확인한 뒤 다시 시도/);
    confirm();
    fireEvent.click(screen.getByRole("button", { name: "75,000,000 G 지불하고 이전" }));
    await screen.findByText(/연결을 확인한 뒤 다시 시도/);
    confirm();
    const execute = screen.getByRole("button", { name: "75,000,000 G 지불하고 이전" });
    fireEvent.click(execute); fireEvent.click(execute);
    await screen.findByText("마법부여 이전이 완료되었습니다.");
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(bodies).toHaveLength(3);
    expect(new Set(bodies.map((body) => body.requestId)).size).toBe(1);
  });

  it("서버에서 대상 상태가 바뀌면 확인창을 닫고 갱신된 옵션으로 다시 확인한다", async () => {
    const latest = { ...target, liberation: { ...target.liberation!, revision: 3, options: [{ id: "base_str_pct", level: 5 }] } };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: false, error: "stale_state", source, target: latest }, { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />); selectTarget(); confirm();
    fireEvent.click(screen.getByRole("button", { name: "75,000,000 G 지불하고 이전" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "마법부여 이전 확인" })).toBeNull());
    expect(await screen.findByText(/장비 상태가 바뀌었습니다/)).toBeTruthy();
    expect(screen.getByText(/기초 STR \+2.25%/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
