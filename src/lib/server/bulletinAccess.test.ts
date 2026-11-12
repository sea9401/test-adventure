import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

vi.mock("@/db", () => ({ db: {} }));

import { bulletinListCategoryWhere } from "./bulletinAccess";

function render(category: string | null, scope: string | null) {
  const where = bulletinListCategoryWhere(category, scope);
  return where == null ? null : new PgDialect().sqlToQuery(where);
}

describe("bulletinListCategoryWhere", () => {
  it("카테고리를 고르지 않은 전체 목록에서는 공지사항을 뺀다", () => {
    const query = render(null, "public");
    expect(query?.sql).toBe('"bulletin_posts"."category" <> $1');
    expect(query?.params).toEqual(["notice"]);
  });

  it("범위가 없는 전체 목록에서도 공지사항을 뺀다", () => {
    expect(render(null, null)?.params).toEqual(["notice"]);
    expect(render("unknown", null)?.params).toEqual(["notice"]);
  });

  it("공지사항 탭은 공지사항만 조회한다", () => {
    const query = render("notice", "public");
    expect(query?.sql).toBe('"bulletin_posts"."category" = $1');
    expect(query?.params).toEqual(["notice"]);
  });

  it("다른 카테고리 탭은 해당 카테고리만 조회한다", () => {
    expect(render("free", "public")?.params).toEqual(["free"]);
    expect(render("guide", "public")?.params).toEqual(["guide"]);
  });

  it("길드 게시판은 카테고리를 가리지 않고 모두 보여 준다", () => {
    expect(render(null, "guild")).toBeNull();
  });
});
