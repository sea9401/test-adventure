import { describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { GROWTH_LEAP_SAVE_KEY } from "@/adventure/data/v2/growthLeap";
import { resetUserCharacterData } from "./resetCharacterData";

describe("캐릭터 데이터 초기화의 계정 상품 보존", () => {
  it("성장 도약 평생 구매·진행 키는 삭제 조건에서 제외한다", async () => {
    let saveDeleteWhere: SQL | null = null;
    const transaction = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(async () => []) })),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn((condition: SQL) => {
          saveDeleteWhere = condition;
          return { returning: vi.fn(async () => []) };
        }),
      })),
    };

    await resetUserCharacterData(transaction as never, "user-1");

    const compiled = new PgDialect().sqlToQuery(saveDeleteWhere as never);
    expect(compiled.sql).toContain("<> $2");
    expect(compiled.params).toEqual(["user-1", GROWTH_LEAP_SAVE_KEY]);
  });
});
