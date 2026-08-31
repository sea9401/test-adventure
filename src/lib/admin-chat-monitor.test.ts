import { describe, expect, it } from "vitest";
import {
  parseAdminChatMessagesQuery,
  parseAdminChatRoomsQuery,
} from "./admin-chat-monitor";

describe("admin chat monitor query parsing", () => {
  it("목록 조회 기본값을 적용한다", () => {
    expect(parseAdminChatRoomsQuery(new URLSearchParams())).toEqual({
      ok: true,
      value: {
        kind: "all",
        visibility: "all",
        q: "",
        offset: 0,
        limit: 50,
      },
    });
  });

  it("목록 조회 enum과 숫자 범위를 거절한다", () => {
    expect(
      parseAdminChatRoomsQuery(new URLSearchParams("kind=unknown")),
    ).toEqual({ ok: false, error: "invalid kind" });
    expect(
      parseAdminChatRoomsQuery(new URLSearchParams("visibility=hidden")),
    ).toEqual({ ok: false, error: "invalid visibility" });
    expect(
      parseAdminChatRoomsQuery(new URLSearchParams("offset=-1")),
    ).toEqual({ ok: false, error: "invalid offset" });
    expect(
      parseAdminChatRoomsQuery(new URLSearchParams("limit=101")),
    ).toEqual({ ok: false, error: "invalid limit" });
  });

  it("방과 길드 메시지에는 양의 scopeId를 요구한다", () => {
    expect(
      parseAdminChatMessagesQuery(new URLSearchParams("kind=room")),
    ).toEqual({ ok: false, error: "invalid scope id" });
    expect(
      parseAdminChatMessagesQuery(
        new URLSearchParams("kind=guild&scopeId=0"),
      ),
    ).toEqual({ ok: false, error: "invalid scope id" });
  });

  it("고정 채널 메시지의 scopeId를 거절한다", () => {
    expect(
      parseAdminChatMessagesQuery(
        new URLSearchParams("kind=global&scopeId=7"),
      ),
    ).toEqual({ ok: false, error: "unexpected scope id" });
  });

  it("메시지 조회 기본값과 이전 페이지 커서를 파싱한다", () => {
    expect(
      parseAdminChatMessagesQuery(new URLSearchParams("kind=global")),
    ).toEqual({
      ok: true,
      value: {
        kind: "global",
        scopeId: null,
        beforeId: null,
        limit: 100,
      },
    });
    expect(
      parseAdminChatMessagesQuery(
        new URLSearchParams("kind=room&scopeId=9&beforeId=21&limit=20"),
      ),
    ).toEqual({
      ok: true,
      value: { kind: "room", scopeId: 9, beforeId: 21, limit: 20 },
    });
  });

  it("메시지 조회의 잘못된 종류와 커서·한도를 거절한다", () => {
    expect(parseAdminChatMessagesQuery(new URLSearchParams())).toEqual({
      ok: false,
      error: "invalid kind",
    });
    expect(
      parseAdminChatMessagesQuery(
        new URLSearchParams("kind=trade&beforeId=-1"),
      ),
    ).toEqual({ ok: false, error: "invalid before id" });
    expect(
      parseAdminChatMessagesQuery(
        new URLSearchParams("kind=trade&limit=0"),
      ),
    ).toEqual({ ok: false, error: "invalid limit" });
  });
});
