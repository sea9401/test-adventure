import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ageEligible: true,
  redirect: vi.fn(),
  auth: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/server/ageEligibility", () => ({
  hasMinimumAgeServiceAccess: vi.fn(async () => mocks.ageEligible),
}));
vi.mock("@/lib/server/profile", () => ({
  hasCompletedOnboarding: vi.fn(async () => false),
}));
vi.mock("./CreateCharacterPageContents", () => ({
  CreateCharacterPageContents: () => null,
}));

import CreatePage from "./page";

describe("캐릭터 생성 연령 경계", () => {
  beforeEach(() => {
    mocks.ageEligible = true;
    mocks.redirect.mockReset();
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    mocks.auth.mockClear();
  });

  it("기존 로그인 세션도 만 14세 이상 확인 전에는 생성 화면에 들어오지 못한다", async () => {
    mocks.ageEligible = false;

    await expect(CreatePage()).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith("/sign-in?age=required");
    expect(mocks.auth).not.toHaveBeenCalled();
  });
});
