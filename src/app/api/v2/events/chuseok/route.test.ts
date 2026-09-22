import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ ensureUser: vi.fn(), read: vi.fn(), attend: vi.fn(), attack: vi.fn(), limit: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit: mocks.limit }));
vi.mock("@/lib/server/economyLog", () => ({ recordEconomyEventSoon: mocks.log }));
vi.mock("@/lib/server/chuseokEvent", async (original) => ({ ...await original<typeof import("@/lib/server/chuseokEvent")>(), chuseokEventService: { read: mocks.read, attend: mocks.attend, attack: mocks.attack } }));
import { GET, POST } from "./route";
const request = (body: unknown) => new Request("http://localhost/api/v2/events/chuseok", { method: "POST", body: JSON.stringify(body) });
describe("추석 이벤트 API", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.ensureUser.mockResolvedValue("u1"); mocks.limit.mockReturnValue(null); });
  it("인증하지 않은 요청은 거절한다", async () => {
    mocks.ensureUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(request({ action: "attack", requestId: "request-1" }))).status).toBe(401);
  });
  it.each([null, [], {}, { action: "attack" }, { action: "attack", requestId: 1 }, { action: "unknown" }])("잘못된 요청 %j을 거절한다", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
  });
  it("상태와 출석 보상을 반환한다", async () => {
    mocks.read.mockResolvedValue({ ok: true, phase: "pending" });
    expect(await (await GET()).json()).toEqual({ ok: true, phase: "pending" });
    mocks.attend.mockResolvedValue({ ok: true, reward: 5 });
    expect(await (await POST(request({ action: "attendance" }))).json()).toEqual({ ok: true, reward: 5 });
  });
  it.each([["daily_limit", 429], ["event_ended", 410], ["event_pending", 409], ["no_character", 409]])("%s 오류 상태를 반환한다", async (error, status) => {
    mocks.attack.mockResolvedValue({ ok: false, error });
    expect((await POST(request({ action: "attack", requestId: "request-1" }))).status).toBe(status);
  });
  it("저장 실패를 성공으로 표시하지 않는다", async () => {
    mocks.attend.mockRejectedValue(new Error("write failed"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(request({ action: "attendance" }))).status).toBe(500);
    spy.mockRestore();
  });
});
