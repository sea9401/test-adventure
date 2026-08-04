import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => null),
}));

import { excludeArenaOperatorAccounts } from "./arenaOperatorEligibility";

const originalAdminEmails = process.env.ADMIN_EMAILS;

describe("아레나 운영 계정 제외", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = "operator@example.com";
  });

  afterAll(() => {
    if (originalAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = originalAdminEmails;
  });

  it("ADMIN_EMAILS 운영 계정만 후보 목록에서 제거한다", () => {
    expect(
      excludeArenaOperatorAccounts([
        { userId: "admin", email: "OPERATOR@example.com" },
        { userId: "player", email: "player@example.com" },
      ]),
    ).toEqual([{ userId: "player", email: "player@example.com" }]);
  });

  it("운영 이메일 설정이 비어 있으면 일반 후보를 그대로 둔다", () => {
    delete process.env.ADMIN_EMAILS;
    const rows = [{ userId: "player", email: "player@example.com" }];
    expect(excludeArenaOperatorAccounts(rows)).toEqual(rows);
  });
});
