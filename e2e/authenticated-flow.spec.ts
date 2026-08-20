import { expect, test, type Page } from "@playwright/test";
import {
  authenticatedE2eAccountDeletionState,
  authenticatedE2eConfig,
  resetAuthenticatedE2eAccount,
  setAuthenticatedE2eCharacterLevel,
} from "./support/authenticatedDatabase";
import { prepareLocalHttpBrowser } from "./support/localHttpBrowser";
import { installStormExpeditionApiFixture } from "./support/stormExpeditionFixture";

const LOCAL_ORIGIN = "http://localhost:3212";
const CHARACTER_NAME = "자동검증모험가";
const ATTENDANCE_CHARACTER_NAME = "출석검증모험가";
const GAMEPLAY_CHARACTER_NAME = "사냥검증모험가";
const DELETION_CHARACTER_NAME = "삭제검증모험가";
const CHAT_CHARACTER_NAME = "채팅검증모험가";
const STORM_DIRECT_CHARACTER_NAME = "원정직접검증가";
const STORM_AUTOPLAY_CHARACTER_NAME = "원정일괄검증가";
const PERSISTED_FLAG = "e2e.persisted-after-login";
const account = authenticatedE2eConfig();

test.skip(
  account === null,
  "격리 PostgreSQL과 E2E_TEST_LOGIN_ID/E2E_TEST_PASSWORD가 필요합니다.",
);

test.beforeEach(async ({ page }) => {
  await prepareLocalHttpBrowser(page, { authenticated: true });
  await resetAuthenticatedE2eAccount();
});

test("신규 모험가의 초기 지급·첫 전직 경계와 저장 진행을 재로그인하면 복원한다", async ({
  page,
}) => {
  test.setTimeout(90_000);
  if (!account) throw new Error("Authenticated E2E configuration is missing");

  await loginWithPassword(page, account.loginId, account.password);
  await createCharacter(page, CHARACTER_NAME);

  const bootstrap = await page.evaluate(async () => {
    const [saveResponse, equipmentResponse, stateResponse] = await Promise.all([
      fetch("/api/save"),
      fetch("/api/v2/me/equipment"),
      fetch("/api/v2/me/state"),
    ]);
    return {
      saves: await saveResponse.json(),
      equipment: await equipmentResponse.json(),
      state: await stateResponse.json(),
    };
  });
  expect(bootstrap.saves["character.v2"]).toMatchObject({
    level: 1,
    exp: 0,
    gold: 50,
    stamina: { current: 2000 },
  });
  expect(bootstrap.saves["character.v2"]).not.toHaveProperty("class");
  expect(bootstrap.saves["inventory.v2"]).toMatchObject({
    potions: { potion_heal_s: 10 },
    materials: { branch: 2 },
    hpCharges: 100_000,
    mpCharges: 100_000,
  });
  expect(bootstrap.state).toMatchObject({
    ok: true,
    battleCount: 0,
    frontierDepth: 2,
    character: {
      level: 1,
      class: "none",
      classDisplayName: "모험가",
      gold: 50,
      hpCharges: 100_000,
      mpCharges: 100_000,
    },
    jobsV2: {
      currentJobId: "none",
      currentJobLevelCap: 100,
    },
  });

  const owned = bootstrap.equipment.owned as Array<{ iid: string; id: string }>;
  const equipped = bootstrap.equipment.equipped as Record<string, string>;
  expect(owned.map((item) => item.id).sort()).toEqual(
    [
      "v2_iron_sword",
      "v2_jade_amulet",
      "v2_leather_armor",
      "v2_leather_boots",
      "v2_leather_gloves",
      "v2_silver_ring",
    ].sort(),
  );
  expect(Object.keys(equipped).sort()).toEqual(
    ["armor", "boots", "gloves", "necklace", "ring", "weapon"].sort(),
  );
  expect(Object.values(equipped).sort()).toEqual(
    owned.map((item) => item.iid).sort(),
  );

  await expect
    .poll(async () => {
      const saves = await page.evaluate(async () =>
        fetch("/api/save").then((response) => response.json()),
      );
      return (saves["storyFlags.v2"]?.flags as string[] | undefined) ?? [];
    })
    .toContain("tutorial.enabled");

  await page.goto("/create");
  await expect(page.getByRole("navigation", { name: "메인 메뉴" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "직업 선택", level: 1 }),
  ).toHaveCount(0);

  const legacyFirstPick = await page.evaluate(async () => {
    const response = await fetch("/api/v2/me/class-element", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ class: "mage" }),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(legacyFirstPick).toEqual({
    status: 400,
    body: { ok: false, error: "use_job_ladder" },
  });

  const tooEarly = await advanceToWarrior(page);
  expect(tooEarly).toEqual({
    status: 400,
    body: { ok: false, error: "level_too_low", required: 100, have: 1 },
  });

  await setAuthenticatedE2eCharacterLevel(100);
  const firstAdvancement = await advanceToWarrior(page);
  expect(firstAdvancement).toMatchObject({
    status: 200,
    body: { ok: true, class: "warrior", reincarnated: true },
  });
  const afterAdvancement = await coreGameplayState(page);
  expect(afterAdvancement.character).toMatchObject({ level: 1, exp: 0 });
  expect(afterAdvancement.jobsV2).toMatchObject({
    currentJobId: "warrior",
    currentJobLevelCap: 100,
  });

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
  const restoredState = await coreGameplayState(page);
  expect(restoredState.jobsV2).toMatchObject({ currentJobId: "warrior" });
});

test("직업 없는 신규 모험가가 첫 출석으로 15일 지원권을 받고 중복 수령은 차단된다", async ({
  page,
}) => {
  test.setTimeout(90_000);
  if (!account) throw new Error("Authenticated E2E configuration is missing");

  await loginWithPassword(page, account.loginId, account.password);
  await createCharacter(page, ATTENDANCE_CHARACTER_NAME);

  const claimedAt = Date.now();
  const first = await page.evaluate(async () => {
    const response = await fetch("/api/v2/me/attendance", { method: "POST" });
    return { status: response.status, body: await response.json() };
  });
  expect(first).toMatchObject({
    status: 200,
    body: {
      ok: true,
      claimedCount: 1,
      reward: { kind: "adventure_support", days: 15 },
    },
  });
  expect(first.body.adventureSupportActiveUntil).toBeGreaterThanOrEqual(
    claimedAt + 15 * 86_400_000,
  );

  const saved = await page.evaluate(async () =>
    fetch("/api/save").then((response) => response.json()),
  );
  expect(saved["character.v2"]).not.toHaveProperty("class");
  expect(saved["character.v2"]).toMatchObject({
    adventureSupport: {
      activeUntil: first.body.adventureSupportActiveUntil,
    },
  });

  const duplicate = await page.evaluate(async () => {
    const response = await fetch("/api/v2/me/attendance", { method: "POST" });
    return { status: response.status, body: await response.json() };
  });
  expect(duplicate).toEqual({
    status: 409,
    body: { ok: false, error: "already_claimed" },
  });
});

test("모바일 전체화면 채팅은 플로팅 토글을 숨기고 헤더에서 이동·닫기할 수 있다", async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"));
  if (!account) throw new Error("Authenticated E2E configuration is missing");

  await loginWithPassword(page, account.loginId, account.password);
  await createCharacter(page, CHAT_CHARACTER_NAME);

  const floatingToggle = page.getByTestId("floating-chat-toggle");
  await expect(floatingToggle).toBeVisible();
  await floatingToggle.click();

  await expect(page.getByRole("dialog", { name: "채팅" })).toBeVisible();
  await expect(floatingToggle).toHaveAttribute("aria-label", "채팅 닫기");
  await expect(floatingToggle).toBeHidden();
  await expect(page.getByRole("button", { name: "채팅 닫기" })).toHaveCount(1);

  const globalRoomButton = page.getByRole("button", {
    name: "전체 채팅방 메시지가 없습니다",
  });
  await globalRoomButton.click();
  const headerRoomBack = page.getByTestId("chat-room-header-back");
  await expect(headerRoomBack).toBeVisible();

  await headerRoomBack.click();
  await expect(headerRoomBack).toHaveCount(0);
  await expect(globalRoomButton).toBeVisible();

  await page.getByRole("button", { name: "채팅 닫기" }).click();
  await expect(page.getByRole("dialog", { name: "채팅" })).toHaveCount(0);
  await expect(floatingToggle).toBeVisible();
});

test("폭풍 원정을 모바일 지도와 노드 모달에서 직접 진행한다", async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"));
  if (!account) throw new Error("Authenticated E2E configuration is missing");

  await loginWithPassword(page, account.loginId, account.password);
  await createCharacter(page, STORM_DIRECT_CHARACTER_NAME);
  const fixture = await installStormExpeditionApiFixture(page);
  await page.goto("/battle/storm-expedition");

  const map = page.getByTestId("storm-expedition-command-map");
  await expect(map).toBeVisible();
  await map.getByRole("button", { name: /칼바람 외곽, 이동 가능/ }).click();
  const nodeDialog = page.getByRole("dialog", { name: "칼바람 외곽" });
  await expect(nodeDialog).toContainText("다음 경로 확인");
  await nodeDialog.getByRole("button", { name: "이 경로로 이동" }).click();
  await expect(nodeDialog.getByRole("button", { name: "전투 시작" })).toBeVisible();

  expect(fixture.actions).toEqual([
    { action: "start", mode: "normal", targetNodeId: "gale_outer" },
  ]);
  await expect(page.getByTestId("storm-expedition-current-action")).toHaveCount(0);
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);

  await nodeDialog.getByRole("button", { name: "확인" }).click();
  const order = await page.evaluate(() => {
    const mapElement = document.querySelector('[data-testid="storm-expedition-command-map"]');
    const support = document.querySelector('[data-testid="storm-expedition-support"]');
    return Boolean(mapElement && support && (mapElement.compareDocumentPosition(support) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(order).toBe(true);
});

test("폭풍 원정을 모바일에서 혼합 항로로 일괄 진행한다", async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"));
  if (!account) throw new Error("Authenticated E2E configuration is missing");

  await loginWithPassword(page, account.loginId, account.password);
  await createCharacter(page, STORM_AUTOPLAY_CHARACTER_NAME);
  const fixture = await installStormExpeditionApiFixture(page);
  await page.goto("/battle/storm-expedition");

  await page.getByRole("button", { name: "일괄 진행 설정" }).click();
  const planDialog = page.getByRole("dialog", { name: "일괄 진행 설정" });
  await expect(planDialog).toContainText("패배하면 임시 전리품을 모두 잃으며 자동 귀환하지 않습니다.");
  await planDialog.getByRole("button", { name: "중층 항로 뇌운" }).click();
  await planDialog.getByRole("button", { name: "수호자 항로 잔해" }).click();
  await planDialog.getByRole("button", { name: "축복 전략 공격 우선" }).click();
  await planDialog.getByRole("button", { name: "일괄 진행 시작" }).click();

  const resultDialog = page.getByRole("dialog", { name: "일괄 진행 완료" });
  await expect(resultDialog).toBeVisible();
  await expect(resultDialog).toContainText("폭풍의 심장");
  await expect(page.getByRole("dialog", { name: /칼바람|뇌운|잔해|표류|제단|정비/ })).toHaveCount(0);

  const moveTargets = fixture.actions
    .filter((action) => action.action === "move")
    .map((action) => action.targetNodeId);
  expect(moveTargets).toEqual(expect.arrayContaining(["thunder_middle", "wreckage_guardian"]));
  expect(fixture.actions).toContainEqual(expect.objectContaining({ action: "choose", choiceId: "swift_fate" }));
  expect(fixture.actions.some((action) => action.action === "withdraw")).toBe(false);
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
  await dismissTutorialOverlayIfVisible(page);

  const battleLogButton = page.getByRole("button", {
    name: "전체 전투 로그 보기",
  });
  await expect(battleLogButton).toBeVisible();
  await battleLogButton.click();
  await expect(page).toHaveURL(/\/battle\/log\/[^/]+$/);
  const battleLogDialog = page.getByRole("dialog", { name: "전투 로그" });
  await expect(battleLogDialog).toBeVisible();
  await battleLogDialog.getByRole("button", { name: "뒤로" }).click();
  await expect(page).toHaveURL(`${LOCAL_ORIGIN}/battle/dungeon/2`);
  await expect(battleLogButton).toBeVisible();

  await battleLogButton.click();
  await expect(page).toHaveURL(/\/battle\/log\/[^/]+$/);
  await expect(battleLogDialog).toBeVisible();
  await battleLogDialog.getByRole("button", { name: "뒤로" }).click();
  await expect(page).toHaveURL(`${LOCAL_ORIGIN}/battle/dungeon/2`);
  await expect(battleLogButton).toBeVisible();

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
  await page.getByRole("link", { name: "환경 설정" }).click();
  await expect(page).toHaveURL(/\/settings\/preferences$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "환경 설정" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /정책·약관/ })).toHaveAttribute(
    "href",
    "/privacy",
  );
  await page.getByRole("button", { name: "회원 탈퇴 진행" }).click();
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
  await page
    .getByRole("checkbox", { name: /커뮤니티 운영정책/ })
    .check();

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

async function dismissTutorialOverlayIfVisible(page: Page) {
  const overlay = page
    .locator('[role="dialog"][aria-labelledby="tutorial-overlay-title"]')
    .first();
  await overlay.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  if (!(await overlay.isVisible())) return;

  await overlay.getByRole("button", { name: "닫기" }).click();
  await expect(overlay).toHaveCount(0);
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
  jobsV2?: {
    currentJobId?: string;
    currentJobLevelCap?: number;
  } | null;
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

async function advanceToWarrior(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/v2/me/advance-class", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetJobId: "warrior" }),
    });
    return { status: response.status, body: await response.json() };
  });
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
