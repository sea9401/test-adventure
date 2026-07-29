import { expect, test, type Page } from "@playwright/test";
import {
  authenticatedE2eConfig,
  resetAuthenticatedE2eAccount,
} from "./support/authenticatedDatabase";

const LOCAL_ORIGIN = "http://localhost:3212";
const CHARACTER_NAME = "자동검증모험가";
const PERSISTED_FLAG = "e2e.persisted-after-login";
const account = authenticatedE2eConfig();

test.skip(
  account === null,
  "격리 PostgreSQL과 E2E_TEST_LOGIN_ID/E2E_TEST_PASSWORD가 필요합니다.",
);

test.beforeEach(async () => {
  await resetAuthenticatedE2eAccount();
});

test("비밀번호 로그인 후 캐릭터를 만들고 저장한 진행을 재로그인하면 복원한다", async ({
  page,
}) => {
  test.setTimeout(90_000);
  if (!account) throw new Error("Authenticated E2E configuration is missing");

  await loginWithPassword(page, account.loginId, account.password);
  await expect(
    page.getByRole("link", { name: "캐릭터 만들고 시작하기" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "캐릭터 만들고 시작하기" }).click();

  await expect(
    page.getByRole("heading", { name: "캐릭터 생성", level: 1 }),
  ).toBeVisible();
  await page.getByPlaceholder("이름 입력").fill(CHARACTER_NAME);
  await expect(page.getByText("사용 가능한 이름이에요.")).toBeVisible();
  await page.getByRole("button", { name: "남성 1" }).click();

  const setupResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/profile/setup") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "모험 시작" }).click();
  expect((await setupResponse).status()).toBe(200);

  await expect(page).toHaveURL(`${LOCAL_ORIGIN}/`);
  await expect(
    page.getByText(CHARACTER_NAME, { exact: true }).first(),
  ).toBeVisible();

  const saveResult = await page.evaluate(async (flag) => {
    const response = await fetch("/api/save?key=storyFlags.v2", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: { flags: [flag] } }),
    });
    return { status: response.status, body: await response.json() };
  }, PERSISTED_FLAG);
  expect(saveResult).toMatchObject({ status: 200, body: { ok: true } });

  await page.getByRole("button", { name: "메뉴" }).click();
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await loginWithPassword(page, account.loginId, account.password);
  await expect(page).toHaveURL(`${LOCAL_ORIGIN}/`);
  await expect(
    page.getByText(CHARACTER_NAME, { exact: true }).first(),
  ).toBeVisible();

  const restored = await page.evaluate(async () => {
    const response = await fetch("/api/save");
    return { status: response.status, body: await response.json() };
  });
  expect(restored.status).toBe(200);
  expect(restored.body["character-profile.v2"]).toEqual({
    name: CHARACTER_NAME,
    gender: "male1",
  });
  expect(restored.body["storyFlags.v2"]).toEqual({
    flags: [PERSISTED_FLAG],
  });
});

async function loginWithPassword(page: Page, loginId: string, password: string) {
  await page.goto("/sign-in");
  const passwordLoginSummary = page
    .locator("summary")
    .filter({ hasText: "아이디·비밀번호로 로그인" });
  await expect(passwordLoginSummary).toBeVisible();
  await passwordLoginSummary.click();
  await page.getByLabel("아이디", { exact: true }).fill(loginId);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
}
