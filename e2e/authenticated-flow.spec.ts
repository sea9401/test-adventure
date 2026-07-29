import { expect, test, type Page } from "@playwright/test";
import {
  authenticatedE2eAccountDeletionState,
  authenticatedE2eConfig,
  resetAuthenticatedE2eAccount,
} from "./support/authenticatedDatabase";
import { prepareLocalHttpBrowser } from "./support/localHttpBrowser";

const LOCAL_ORIGIN = "http://localhost:3212";
const CHARACTER_NAME = "자동검증모험가";
const GAMEPLAY_CHARACTER_NAME = "사냥검증모험가";
const DELETION_CHARACTER_NAME = "삭제검증모험가";
const PERSISTED_FLAG = "e2e.persisted-after-login";
const account = authenticatedE2eConfig();

test.skip(
  account === null,
  "격리 PostgreSQL과 E2E_TEST_LOGIN_ID/E2E_TEST_PASSWORD가 필요합니다.",
);

test.beforeEach(async ({ page }) => {
  await prepareLocalHttpBrowser(page);
  await resetAuthenticatedE2eAccount();
});

test("비밀번호 로그인 후 캐릭터를 만들고 저장한 진행을 재로그인하면 복원한다", async ({
  page,
}) => {
  test.setTimeout(90_000);
  if (!account) throw new Error("Authenticated E2E configuration is missing");

  await loginWithPassword(page, account.loginId, account.password);
  await createCharacter(page, CHARACTER_NAME);

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

test("전투 메뉴로 사냥터에 진입해 얻은 진행은 새로고침과 재로그인 뒤에도 복원된다", async ({
  page,
}) => {
  test.setTimeout(90_000);
  if (!account) throw new Error("Authenticated E2E configuration is missing");

  await loginWithPassword(page, account.loginId, account.password);
  await createCharacter(page, GAMEPLAY_CHARACTER_NAME);

  const before = await coreGameplayState(page);
  expect(before.battleCount).toBe(0);

  const mainNavigation = page.getByRole("navigation", { name: "메인 메뉴" });
  await mainNavigation.getByRole("button", { name: "전투", exact: true }).click();
  await page
    .getByRole("menu", { name: "전투 메뉴" })
    .getByRole("menuitem", { name: "사냥터" })
    .click();
  await expect(page).toHaveURL(`${LOCAL_ORIGIN}/battle/dungeon`);

  await page.getByRole("button", { name: /^들판/ }).click();
  await expect(page.getByText("들판", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /^입구/ }).click();
  await expect(page).toHaveURL(`${LOCAL_ORIGIN}/battle/dungeon/2`);

  const huntResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v2/dungeon/hunt") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^사냥 \(/ }).click();
  const response = await huntResponse;
  expect(response.status()).toBe(200);
  const hunt = (await response.json()) as {
    ok?: boolean;
    result?: {
      won?: boolean;
      expGained?: number;
      goldGained?: number;
      expAfter?: number;
      goldAfter?: number;
    };
  };
  expect(hunt.ok).toBe(true);
  expect(hunt.result?.won).toBe(true);
  expect(hunt.result?.expGained).toBeGreaterThan(0);
  expect(hunt.result?.goldGained).toBeGreaterThan(0);
  await expect(page.getByText("승리", { exact: true }).first()).toBeVisible();

  const afterHunt = await coreGameplayState(page);
  expect(afterHunt.battleCount).toBe(before.battleCount + 1);
  expect(afterHunt.character.exp).toBe(hunt.result?.expAfter);
  expect(afterHunt.character.gold).toBe(hunt.result?.goldAfter);
  expect(afterHunt.character.stamina.current).toBeLessThan(
    before.character.stamina.current,
  );

  await page.reload();
  const afterReload = await coreGameplayState(page);
  expect(stableGameplayProgress(afterReload)).toEqual(
    stableGameplayProgress(afterHunt),
  );

  await page.getByRole("button", { name: "메뉴" }).click();
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await loginWithPassword(page, account.loginId, account.password);
  await expect(page).toHaveURL(`${LOCAL_ORIGIN}/`);
  await expect(
    page.getByText(GAMEPLAY_CHARACTER_NAME, { exact: true }).first(),
  ).toBeVisible();

  const afterRelogin = await coreGameplayState(page);
  expect(stableGameplayProgress(afterRelogin)).toEqual(
    stableGameplayProgress(afterHunt),
  );
});

test("회원 탈퇴는 확인 문구를 요구하고 계정·진행·세션을 영구 삭제한다", async ({
  page,
}) => {
  test.setTimeout(90_000);
  if (!account) throw new Error("Authenticated E2E configuration is missing");

  await loginWithPassword(page, account.loginId, account.password);
  await createCharacter(page, DELETION_CHARACTER_NAME);

  await page.getByRole("button", { name: "메뉴" }).click();
  await page.getByRole("button", { name: "회원 탈퇴" }).click();
  const dialog = page.getByRole("dialog", { name: "회원 탈퇴" });
  await expect(dialog).toBeVisible();

  const confirmInput = dialog.getByRole("textbox");
  const deleteButton = dialog.getByRole("button", { name: "영구 삭제" });
  await expect(deleteButton).toBeDisabled();
  await confirmInput.fill("다른이름");
  await expect(deleteButton).toBeDisabled();
  await confirmInput.fill(DELETION_CHARACTER_NAME);
  await expect(deleteButton).toBeEnabled();

  const deleteResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/account/delete") &&
      response.request().method() === "POST",
  );
  await deleteButton.click();
  const response = await deleteResponse;
  expect(response.status()).toBe(200);

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "무슨무슨게임" }),
  ).toBeVisible();
  const anonymousSaveStatus = await page.evaluate(async () =>
    fetch("/api/save").then((saveResponse) => saveResponse.status),
  );
  expect(anonymousSaveStatus).toBe(401);
  await expect(authenticatedE2eAccountDeletionState()).resolves.toEqual({
    users: 0,
    credentials: 0,
    saves: 0,
    feed: 0,
  });

  await loginWithPassword(page, account.loginId, account.password);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "아이디 또는 비밀번호를 확인해 주세요." }),
  ).toHaveText("아이디 또는 비밀번호를 확인해 주세요.");
  await expect(page).toHaveURL(/\/sign-in$/);
});

async function createCharacter(page: Page, name: string) {
  await expect(
    page.getByRole("link", { name: "캐릭터 만들고 시작하기" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "캐릭터 만들고 시작하기" }).click();

  await expect(
    page.getByRole("heading", { name: "캐릭터 생성", level: 1 }),
  ).toBeVisible();
  await page.getByPlaceholder("이름 입력").fill(name);
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
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
}

type CoreGameplayState = {
  battleCount: number;
  frontierDepth: number;
  character: {
    level: number;
    exp: number;
    gold: number;
    stamina: { current: number };
  };
};

async function coreGameplayState(page: Page): Promise<CoreGameplayState> {
  return page.evaluate(async () => {
    const response = await fetch("/api/v2/me/state");
    if (!response.ok) {
      throw new Error(`core gameplay state failed: ${response.status}`);
    }
    return response.json() as Promise<CoreGameplayState>;
  });
}

function stableGameplayProgress(state: CoreGameplayState) {
  return {
    battleCount: state.battleCount,
    frontierDepth: state.frontierDepth,
    level: state.character.level,
    exp: state.character.exp,
    gold: state.character.gold,
  };
}

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
