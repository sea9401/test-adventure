import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { cookingFirstDiscoveries } from "./cookingSchema";

describe("요리 최초 발견 기록", () => {
  it("발견자가 탈퇴해도 행을 지우지 않고 발견자 참조만 비운다", () => {
    const config = getTableConfig(cookingFirstDiscoveries);
    const userIdColumn = config.columns.find((column) => column.name === "user_id");

    expect(userIdColumn?.notNull).toBe(false);
    expect(config.foreignKeys.map((foreignKey) => foreignKey.onDelete)).toEqual(["set null"]);
  });
});
