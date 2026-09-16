import { afterEach, describe, expect, it, vi } from "vitest";
import { applyCoopBulkSettings } from "./coopBulkSettings";

afterEach(() => vi.unstubAllGlobals());
const session = (id: string, extra = {}) => ({
  id, isOwner: true, hp: 100, expiresAt: Date.now() + 60_000,
  visibility: "summoner_only" as const, ...extra,
});

describe("내 보스 일괄 설정", () => {
  it("내 활성 보스만 무료 지원 후 공개하고 개별 API로 소유권을 재검사한다", async () => {
    const requests: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      requests.push({ url, body: JSON.parse(String(init.body)) });
      return Response.json({ ok: true, visibility: "public" });
    });
    const result = await applyCoopBulkSettings([
      session("mine"), session("other", { isOwner: false }),
      session("expired", { expiresAt: 0 }), session("dead", { hp: 0 }),
    ], { allowFreeSupport: true, visibility: "public" });
    expect(requests).toEqual([
      { url: "/api/v2/coop/mine/support", body: { allowFreeSupport: true } },
      { url: "/api/v2/coop/mine/visibility", body: { visibility: "public" } },
    ]);
    expect(result).toEqual({ applied: 2, skipped: 0, failed: 0, guildFallback: 0 });
  });

  it("공개 범위 축소만 건너뛰며 지원 해제는 적용한다", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return Response.json({ ok: true });
    });
    expect(await applyCoopBulkSettings([
      session("public", { visibility: "public" }),
    ], { allowFreeSupport: false, visibility: "summoner_only" })).toEqual({
      applied: 1, skipped: 1, failed: 0, guildFallback: 0,
    });
    expect(urls).toEqual(["/api/v2/coop/public/support"]);
  });

  it("중간 실패 후 다음 보스를 처리하고 서버의 처치/공개 제한도 구분한다", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("network")) throw new Error("offline");
      if (url.includes("ended")) return Response.json({ ok: false, error: "not_active" }, { status: 409 });
      if (url.includes("locked")) return Response.json({ ok: false, error: "visibility_locked" }, { status: 409 });
      if (url.includes("other")) return Response.json({ ok: false, error: "not_owner" }, { status: 403 });
      return Response.json({ ok: true, visibility: "guild_only" });
    });
    expect(await applyCoopBulkSettings([
      session("network"), session("ended"), session("locked"), session("other"), session("last"),
    ], { visibility: "guild_only" })).toEqual({ applied: 1, skipped: 2, failed: 2, guildFallback: 0 });
  });

  it("길드가 없어 나만으로 적용된 결과를 알린다", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ ok: true, visibility: "summoner_only" }));
    expect(await applyCoopBulkSettings([session("mine")], { visibility: "guild_only" }))
      .toEqual({ applied: 1, skipped: 0, failed: 0, guildFallback: 1 });
  });

  it("변경 안 함은 요청을 보내지 않는다", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await applyCoopBulkSettings([session("mine")], {}))
      .toEqual({ applied: 0, skipped: 0, failed: 0, guildFallback: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
