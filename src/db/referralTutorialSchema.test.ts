import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { referralConversions } from "./schema";

describe("referral tutorial schema", () => {
  it("홍보 귀속 행에 완료 과제 배열을 기본값과 함께 저장한다", () => {
    const column = getTableColumns(referralConversions).completedTutorialTaskIds;

    expect(column).toBeDefined();
    expect(column.name).toBe("completed_tutorial_task_ids");
    expect(column.notNull).toBe(true);
    expect(column.hasDefault).toBe(true);
  });
});
