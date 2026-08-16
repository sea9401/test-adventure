import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => null),
}));

import { filterArenaOpponentEligibleRows } from "./arenaOpponentEligibility";

const originalAdminEmails = process.env.ADMIN_EMAILS;

describe("아레나 상대 후보 적격성", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = "operator@example.com";
  });

  afterAll(() => {
    if (originalAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = originalAdminEmails;
  });

  it("현재 제재 중이거나 운영 계정인 후보를 제외한다", () => {
    const now = new Date("2026-08-16T00:00:00.000Z");
    const rows = [
      { id: "active", email: "active@example.com", bannedUntil: null },
      {
        id: "expired",
        email: "expired@example.com",
        bannedUntil: new Date("2026-08-16T00:00:00.000Z"),
      },
      {
        id: "suspended",
        email: "suspended@example.com",
        bannedUntil: new Date("2026-08-16T00:00:00.001Z"),
      },
      {
        id: "banned",
        email: "banned@example.com",
        bannedUntil: new Date("9999-12-31T23:59:59.999Z"),
      },
      {
        id: "operator",
        email: "OPERATOR@example.com",
        bannedUntil: null,
      },
    ];

    expect(
      filterArenaOpponentEligibleRows(rows, now).map((row) => row.id),
    ).toEqual(["active", "expired"]);
  });
});
