// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoopManagementPanel } from "./CoopManagementPanel";
import { useCoopManagement } from "./useCoopManagement";
import type { CoopSessionSummary } from "./useCoopBossState";

const h = vi.hoisted(() => ({ confirm: vi.fn(async () => true) }));
vi.mock("@/components/ui/gameDialog", () => ({ confirmGameAction: h.confirm }));
const sessions = [{ id: "mine", isOwner: true, hp: 100, expiresAt: Date.now() + 60_000, visibility: "summoner_only" }] as CoopSessionSummary[];
function Harness() {
  const management = useCoopManagement({ sessions, refresh: async () => undefined, busy: false });
  return <CoopManagementPanel management={management} sessions={sessions} busy={false} loaded />;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => h.confirm.mockReset().mockResolvedValue(true));

describe("협동 보스 관리", () => {
  it("계정 설정을 불러와 변경하고 재진입해도 유지한다", async () => {
    let saved = true;
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") saved = JSON.parse(String(init.body)).autoFreeSupport;
      return Response.json({ ok: true, autoFreeSupport: saved });
    });
    const first = render(<Harness />);
    const checkbox = screen.getByRole("checkbox", { name: "무료 토벌 지원 허용" }) as HTMLInputElement;
    await waitFor(() => expect(checkbox.checked).toBe(true));
    fireEvent.click(checkbox);
    await waitFor(() => expect(checkbox.checked).toBe(false));
    expect(saved).toBe(false);
    first.unmount();
    render(<Harness />);
    await waitFor(() => expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(false));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });

  it("저장 실패 시 기존 선택을 유지하며 오류를 알린다", async () => {
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => init?.method === "POST"
      ? Response.json({ ok: false }, { status: 500 })
      : Response.json({ ok: true, autoFreeSupport: false }));
    render(<Harness />);
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    await waitFor(() => expect(checkbox.disabled).toBe(false));
    fireEvent.click(checkbox);
    await screen.findByText("자동 무료 지원 설정을 저장하지 못했습니다. 다시 시도하세요.");
    expect(checkbox.checked).toBe(false);
  });

  it("처음 조회에 실패하면 재시도할 수 있다", async () => {
    let fails = true;
    vi.stubGlobal("fetch", async () => {
      if (fails) throw new Error("offline");
      return Response.json({ ok: true, autoFreeSupport: true });
    });
    render(<Harness />);
    const retry = await screen.findByRole("button", { name: "설정 다시 불러오기" });
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
    fails = false;
    fireEvent.click(retry);
    await waitFor(() => expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true));
  });

  it("선택만으로 변경하지 않고 적용 시 확인을 거쳐 두 설정을 전송한다", async () => {
    const posts: unknown[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") posts.push({ url, body: JSON.parse(String(init.body)) });
      return Response.json({ ok: true, autoFreeSupport: false, visibility: "public" });
    });
    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox", { name: "무료 지원 일괄 설정" }), { target: { value: "on" } });
    fireEvent.change(screen.getByRole("combobox", { name: "공개 범위 일괄 설정" }), { target: { value: "public" } });
    expect(posts).toEqual([]);
    const apply = screen.getByRole("button", { name: "내 보스 1마리에 적용" });
    h.confirm.mockResolvedValueOnce(false);
    fireEvent.click(apply);
    await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1));
    expect(posts).toEqual([]);
    await waitFor(() => expect((apply as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(apply);
    await screen.findByText(/설정 2건 적용/);
    expect(posts).toEqual([
      { url: "/api/v2/coop/mine/support", body: { allowFreeSupport: true } },
      { url: "/api/v2/coop/mine/visibility", body: { visibility: "public" } },
    ]);
  });

  it("처리 중에는 일괄 적용을 중복 실행하지 않는다", async () => {
    let finish!: (response: Response) => void;
    let requests = 0;
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      if (init?.method !== "POST") return Response.json({ ok: true, autoFreeSupport: false });
      requests++;
      return new Promise<Response>((resolve) => { finish = resolve; });
    });
    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox", { name: "무료 지원 일괄 설정" }), { target: { value: "on" } });
    const apply = screen.getByRole("button", { name: "내 보스 1마리에 적용" }) as HTMLButtonElement;
    fireEvent.click(apply);
    await waitFor(() => expect(requests).toBe(1));
    expect(apply.disabled).toBe(true);
    fireEvent.click(apply);
    expect(requests).toBe(1);
    finish(Response.json({ ok: true }));
    await screen.findByText(/설정 1건 적용/);
  });
});
