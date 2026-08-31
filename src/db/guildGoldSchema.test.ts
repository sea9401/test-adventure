import { describe, expect, it } from "vitest";
import { v2GuildResources } from "./schema";

describe("guild gold schema", () => {
  it("stores balances above the PostgreSQL 32-bit integer limit", () => {
    expect(v2GuildResources.gold.getSQLType()).toBe("bigint");
    expect(v2GuildResources.gold.mapFromDriverValue("2152828938")).toBe(
      2_152_828_938,
    );
  });
});
