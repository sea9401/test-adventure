import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function routeFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...routeFiles(path));
    else if (entry.isFile() && entry.name === "route.ts") found.push(path);
  }
  return found.sort();
}

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("production security surface", () => {
  it("모든 관리자 API가 라우트 내부 권한 검사를 가진다", () => {
    const routes = routeFiles(join(ROOT, "src/app/api/admin"));
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(
        source(route),
        `${relative(ROOT, route)} is missing an admin authorization call`,
      ).toMatch(/(?:requireAdmin|requireAdminRole)\s*\(/);
    }
  });

  it("모든 크론 API가 CRON_SECRET 검사를 가진다", () => {
    const routes = [
      ...routeFiles(join(ROOT, "src/app/api/cron")),
      ...routeFiles(join(ROOT, "src/app/api/v2/cron")),
    ];
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(
        source(route),
        `${relative(ROOT, route)} is missing requireCronAuth`,
      ).toMatch(/requireCronAuth\s*\(/);
    }
  });

  it("개발 API는 라이브 404와 최고 관리자 검사를 함께 가진다", () => {
    const routes = routeFiles(join(ROOT, "src/app/api/v2/dev"));
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      const contents = source(route);
      expect(contents, relative(ROOT, route)).toContain(
        'process.env.NODE_ENV === "production"',
      );
      expect(contents, relative(ROOT, route)).toContain(
        'process.env.IS_STAGING !== "true"',
      );
      expect(contents, relative(ROOT, route)).toMatch(
        /requireAdminRole\("super"\)/,
      );
    }
  });

  it("개발 UI와 출시 전 코인 상점이 일반 이용자에게 닫혀 있다", () => {
    const devLayout = source(join(ROOT, "src/app/dev/layout.tsx"));
    expect(devLayout).toContain('process.env.NODE_ENV === "production"');
    expect(devLayout).toContain('process.env.IS_STAGING !== "true"');
    expect(devLayout).toContain("notFound()");

    const productionEnv = source(join(ROOT, ".env.production"));
    expect(productionEnv).toMatch(
      /^NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN=false$/m,
    );
    expect(productionEnv).toMatch(
      /^MUSEUN_COIN_SHOP_REVIEW_LOGIN_IDS=gcrb-review-01,gcrb-review-02,gcrb-review-03$/m,
    );
    expect(productionEnv).toMatch(
      /^MUSEUN_COIN_SHOP_REVIEW_USER_IDS=[0-9a-f-]+,[0-9a-f-]+,[0-9a-f-]+$/m,
    );

    const coinShopPage = source(
      join(ROOT, "src/app/(game)/settings/coin-shop/page.tsx"),
    );
    const coinShopApi = source(
      join(ROOT, "src/app/api/v2/museun-coin-shop/route.ts"),
    );
    const coinShopAccess = source(
      join(ROOT, "src/lib/server/museunCoinShopAccess.ts"),
    );
    expect(coinShopPage).toContain("canAccessMuseunCoinShop");
    expect(coinShopPage).toContain("notFound()");
    expect(coinShopApi).toContain("canAccessMuseunCoinShop");
    expect(coinShopApi).toContain("unavailable()");
    expect(coinShopAccess).toContain("DEFAULT_REVIEW_LOGIN_IDS");
    expect(coinShopAccess).toContain("ADMIN_EMAILS");

    const proxy = source(join(ROOT, "src/proxy.ts"));
    const maintenancePage = source(join(ROOT, "deploy/maintenance.html"));
    const authConfig = source(join(ROOT, "src/auth.config.ts"));
    expect(authConfig).toContain("session.user.id = token.sub");
    expect(proxy).toContain("canPassMuseunCoinShopProxy");
    expect(proxy).toContain('req.nextUrl.pathname === "/settings/coin-shop"');
    expect(proxy).toContain(
      'req.nextUrl.pathname === "/api/v2/museun-coin-shop"',
    );
    expect(proxy).toMatch(/status:\s*404/);

    expect(proxy).toContain("LIFE_HOUSING_ROUTES_ENABLED = false");
    for (const path of [
      'pathname === "/character/room"',
      'pathname === "/api/v2/me/housing"',
      "\\/character\\/[^/]+\\/room",
      "\\/api\\/v2\\/player\\/[^/]+\\/housing",
    ]) {
      expect(proxy).toContain(path);
    }
    for (const maintenance of [proxy, maintenancePage]) {
      expect(maintenance).toContain("서버 점검 안내");
      expect(maintenance).toContain("서버 점검");
      expect(maintenance).toContain(
        "안정적인 서비스 제공을 위해 아래와 같이 서버 점검을 진행합니다.",
      );
      expect(maintenance).toContain("점검 시간:");
      expect(maintenance).toContain(
        "2026년 9월 3일(목) 오전 4:00 ~ 오전 4:30",
      );
      expect(maintenance).toContain("예상 소요 시간:");
      expect(maintenance).toContain("30분");
      expect(maintenance).toContain("점검 내용:");
      expect(maintenance).toContain("서비스 안정화 및 업데이트");
      expect(maintenance).toContain("점검 영향:");
      expect(maintenance).toContain(
        "점검 중 게임 접속 및 이용 불가",
      );
      expect(maintenance).toContain(
        "점검 상황에 따라 종료 시간이 변경될 수 있으며, 점검이 완료되면 별도로 안내해 드리겠습니다.",
      );
      expect(maintenance).toContain("이용에 불편을 드려 죄송합니다.");
      expect(maintenance).toContain(
        "더욱 안정적인 서비스를 제공할 수 있도록 최선을 다하겠습니다.",
      );
      expect(maintenance).not.toContain("오류 수정 패치 점검 안내");
      expect(maintenance).not.toContain("08:30 ~ 08:45 (약 15분)");
      expect(maintenance).not.toContain("약 1시간 30분");
      expect(maintenance).not.toContain("게임에 접속할 수 없습니다.");
    }
  });

  it("심의용 비밀번호 재로그인은 다른 기기로 단일 세션을 안전하게 인계한다", () => {
    const auth = source(join(ROOT, "src/auth.ts"));
    const credentialsBranch = auth.slice(
      auth.indexOf('if (account.type === "credentials")'),
      auth.indexOf("if (account.provider !== \"kakao\")"),
    );

    expect(credentialsBranch).toContain("DEVICE_SESSION_TAKEOVER_COOKIE");
    expect(credentialsBranch).toContain('cookieStore.set(DEVICE_SESSION_TAKEOVER_COOKIE, "1"');
    expect(credentialsBranch).toContain("maxAge: 5 * 60");
  });

  it("배포가 최신 크론 목록을 설치하고 개인정보 정리 작업을 확인한다", () => {
    const workflow = source(join(ROOT, ".github/workflows/deploy.yml"));
    const manualDeploy = source(join(ROOT, "deploy/deploy.sh"));
    const release = source(join(ROOT, "deploy/release-production.sh"));

    for (const entrypoint of [workflow, manualDeploy]) {
      expect(entrypoint).toContain("bash deploy/release-production.sh");
    }
    for (const marker of [
      "crontab deploy/crontab.txt",
      "/api/v2/cron/battle-replay-retention",
      "/api/v2/cron/ops-retention",
      "/api/v2/cron/ops-daily-report",
    ]) {
      expect(release).toContain(marker);
    }
  });

  it("일일 DB 백업은 실패 알림 래퍼를 통해 실행한다", () => {
    const crontab = source(join(ROOT, "deploy/crontab.txt"));

    expect(crontab).toContain(
      "0 17 * * * cd ~/adventure-rpg && bash deploy/run-backup.sh",
    );
    expect(crontab).not.toMatch(
      /^0 17 \* \* \* .*bash deploy\/backup-db\.sh/m,
    );
  });

  it("운영 배포가 journald 용량 제한을 적용한다", () => {
    const release = source(join(ROOT, "deploy/release-production.sh"));

    expect(release).toContain("bash deploy/configure-log-retention.sh");
  });

  it("배포 뒤 점검 화면을 유지하고 해제 뒤에는 전체 공개 표면을 검사한다", () => {
    const workflow = source(join(ROOT, ".github/workflows/deploy.yml"));
    const manualDeploy = source(join(ROOT, "deploy/deploy.sh"));
    const smoke = source(join(ROOT, "scripts/check-public-release.mjs"));

    expect(workflow).toContain("npm run check-public-release");
    expect(workflow).toContain("PUBLIC_RELEASE_EXPECTED_BUILD_ID");
    expect(workflow).toContain("PUBLIC_RELEASE_MAINTENANCE_POLICY: require");
    expect(manualDeploy).toContain("npm run check-public-release");
    expect(manualDeploy).toContain("PUBLIC_RELEASE_MAINTENANCE_POLICY=require");
    for (const path of [
      "/api/health",
      "/api/version",
      "/sign-in",
      "/terms",
      "/privacy",
      "/operations",
      "/licenses",
      "/third-party-notices.txt",
      "/dev",
      "/settings/coin-shop",
      "/api/v2/museun-coin-shop",
      "/character/room",
      "/character/nonexistent/room",
      "/api/v2/me/housing",
      "/api/v2/player/nonexistent/housing",
      "/api/v2/dev/grant",
    ]) {
      expect(smoke, `public release smoke is missing ${path}`).toContain(
        `path: "${path}"`,
      );
    }
  });

  it("EC2 수동 fallback 빌드를 자원·시간 제한 안에서 실행한다", () => {
    const build = source(join(ROOT, "deploy/build-production.sh"));

    expect(build).toContain("systemd-run");
    expect(build).toContain("MemoryHigh=1800M");
    expect(build).toContain("MemoryMax=2100M");
    expect(build).toContain("MemorySwapMax=256M");
    expect(build).toContain(
      'BUILD_TIMEOUT="${PRODUCTION_BUILD_TIMEOUT:-20m}"',
    );
    expect(build).toContain('RuntimeMaxSec="$BUILD_TIMEOUT"');
    expect(build).toContain("OOMPolicy=stop");
    expect(build).toContain("--pipe");
    expect(build).toContain('PREVIOUS_BUILD=".next.previous"');
    expect(build).toContain("restore_previous_build");
  });

  it("성공한 main CI 빌드만 SHA·체크섬으로 운영에 전달한다", () => {
    const ci = source(join(ROOT, ".github/workflows/ci.yml"));
    const deploy = source(join(ROOT, ".github/workflows/deploy.yml"));
    const prepare = source(
      join(ROOT, "scripts/prepare-production-artifact.mjs"),
    );
    const install = source(
      join(ROOT, "deploy/install-production-build.sh"),
    );

    expect(ci).toContain("BUILD_ID: ${{ github.sha }}");
    expect(ci).toContain("scripts/prepare-production-artifact.mjs");
    expect(ci).toContain("production-next-${{ github.sha }}");
    expect(ci).toContain("sha256sum production-next.tar.gz");
    expect(ci).toMatch(/actions\/upload-artifact@[0-9a-f]{40} # v7/);

    expect(deploy).toContain("actions/workflows/ci.yml/runs");
    expect(deploy).toContain("head_sha=$DEPLOY_SHA");
    expect(deploy).toMatch(/actions\/download-artifact@[0-9a-f]{40} # v8/);
    expect(deploy).toMatch(/appleboy\/scp-action@[0-9a-f]{40} # v1\.0\.0/);
    expect(deploy).toContain("PRODUCTION_BUILD_ARCHIVE");
    expect(deploy).not.toContain("- run: npm run build");

    expect(prepare).toContain("native binary cannot cross x64 CI to ARM64");
    expect(prepare).toContain("runtimeDependencies: \"external-node_modules\"");
    expect(install).toContain("sha256sum --check");
    expect(install).toContain("artifact SHA");
    expect(install).toContain('PREVIOUS_BUILD=".next.previous"');
    expect(install).toContain("previous Next build restored");
  });

  it("일반 단위 테스트는 병렬 실행하고 결정적 시뮬레이션만 단일 worker로 격리한다", () => {
    const workflow = source(join(ROOT, ".github/workflows/ci.yml"));

    expect(workflow).toContain(
      "run: npx vitest run --exclude src/adventure/data/v2/levelDesignSim.test.ts",
    );
    expect(workflow).toMatch(
      /level-design-sim-tests:[\s\S]*?run: npx vitest run src\/adventure\/data\/v2\/levelDesignSim\.test\.ts --maxWorkers=1/,
    );
    expect(workflow).toContain(
      "needs: [static-checks, unit-tests, level-design-sim-tests, production-build, browser-e2e]",
    );
    expect(workflow).toContain(
      "LEVEL_DESIGN_SIM_TESTS_RESULT: ${{ needs.level-design-sim-tests.result }}",
    );
    expect(workflow).toContain(
      'test "$LEVEL_DESIGN_SIM_TESTS_RESULT" = "success"',
    );
  });

  it("운영 빌드 동안 두 Next 런타임을 멈추고 실패 시 복구한다", () => {
    const release = source(join(ROOT, "deploy/release-production.sh"));
    const stagingService = source(
      join(ROOT, "deploy/adventure-rpg-test.service"),
    );

    expect(release).toContain("recover_on_failure");
    expect(release).toContain('systemctl stop "$STAGING_SERVICE"');
    expect(release).toContain('systemctl stop "$PRODUCTION_SERVICE"');
    expect(release).toContain('systemctl start "$PRODUCTION_SERVICE"');
    expect(release).toContain('systemctl start "$STAGING_SERVICE"');
    expect(release).toContain("bash deploy/install-production-build.sh");
    expect(release).toContain('BUILD_SWAPPED=0');
    expect(release).toContain("previous Next build restored");
    expect(release.match(/^sync_production_env$/gm)).toHaveLength(2);
    expect(stagingService).toContain("MemoryMax=768M");
    expect(stagingService).toContain("MemorySwapMax=256M");
  });

  it("일반 배포는 main 산출물 준비 뒤 실제 교체 직전에 점검을 시작한다", () => {
    const instructions = source(join(ROOT, "AGENTS.md"));
    const workflow = source(join(ROOT, ".github/workflows/deploy.yml"));
    const release = source(join(ROOT, "deploy/release-production.sh"));
    const normalizedInstructions = instructions.replace(/\s+/g, " ");

    expect(normalizedInstructions).toContain(
      "정확한 main SHA의 CI와 production-next-<SHA> 산출물이 준비되기 전에는",
    );
    expect(normalizedInstructions).toContain(
      '사용자가 점검 모드를 "지금 바로" 켜라고 명시하거나',
    );
    expect(normalizedInstructions).toContain(
      '일반적인 "점검 모드를 켜고 배포" 요청은 즉시 활성화 지시로 해석하지 않는다.',
    );

    const locateArtifact = workflow.indexOf(
      "Locate successful main CI artifact",
    );
    const transferArtifact = workflow.indexOf(
      "Transfer production build to EC2",
    );
    const deployRuntime = workflow.indexOf("SSH & deploy [prod]");
    expect(locateArtifact).toBeGreaterThan(-1);
    expect(transferArtifact).toBeGreaterThan(locateArtifact);
    expect(deployRuntime).toBeGreaterThan(transferArtifact);

    const productionPreflight = release.indexOf("production env preflight");
    const maintenanceOn = release.indexOf("bash deploy/maintenance.sh on");
    const productionStop = release.indexOf(
      'sudo systemctl stop "$PRODUCTION_SERVICE"',
      maintenanceOn,
    );
    expect(productionPreflight).toBeGreaterThan(-1);
    expect(maintenanceOn).toBeGreaterThan(productionPreflight);
    expect(productionStop).toBeGreaterThan(maintenanceOn);
  });

  it("배포와 롤백은 명시적 승인 전까지 점검 모드를 해제하지 않는다", () => {
    const instructions = source(join(ROOT, "AGENTS.md"));
    const release = source(join(ROOT, "deploy/release-production.sh"));
    const rollback = source(join(ROOT, "deploy/rollback.sh"));

    expect(instructions).toContain("점검 모드를 자동으로 해제하지 않는다");
    expect(release).not.toMatch(/^\s*bash deploy\/maintenance\.sh off\s*$/m);
    expect(rollback).not.toMatch(
      /^\s*PROJECT_DIR=.*bash "\$MAINTENANCE_TOOL" off\s*$/m,
    );
    expect(release).toContain("maintenance remains enabled");
    expect(rollback).toContain("점검모드: 유지 중");
  });

  it("5분 정기 감시가 배포와 동일한 공개 출시 표면을 검사한다", () => {
    const workflow = source(join(ROOT, ".github/workflows/uptime.yml"));
    const monitor = source(join(ROOT, "deploy/check-external-health.sh"));

    expect(workflow).toContain('cron: "*/5 * * * *"');
    expect(workflow).toContain("Check full public release surface");
    expect(workflow).toContain("PUBLIC_RELEASE_RETRIES");
    expect(workflow).toContain("PUBLIC_RELEASE_RETRY_DELAY_MS");
    expect(workflow).toContain("PUBLIC_RELEASE_MAINTENANCE_POLICY: allow");
    expect(workflow).toContain("bash deploy/check-external-health.sh");
    expect(monitor).toContain("node scripts/check-public-release.mjs");
  });

  it("추적 파일의 비밀값 누출을 CI에서 차단한다", () => {
    const workflow = source(join(ROOT, ".github/workflows/ci.yml"));
    const packageJson = source(join(ROOT, "package.json"));
    const guard = source(join(ROOT, "scripts/check-secrets.mjs"));

    expect(workflow).toContain("npm run check-secrets");
    expect(packageJson).toContain('"check-secrets"');
    for (const marker of [
      "private-key",
      "aws-access-key",
      "github-token",
      "discord-webhook",
      "database-url-with-password",
      "literal-",
    ]) {
      expect(guard).toContain(marker);
    }
  });

  it("CI가 데스크톱·모바일 실제 브라우저와 접근성 검사를 실행한다", () => {
    const workflow = source(join(ROOT, ".github/workflows/ci.yml"));
    const playwrightConfig = source(join(ROOT, "playwright.config.ts"));
    const browserTests = source(join(ROOT, "e2e/public-surface.spec.ts"));

    expect(workflow).toContain(
      "mcr.microsoft.com/playwright:v1.62.0-noble",
    );
    expect(workflow).toContain(
      "Verify Playwright image and package versions match",
    );
    expect(workflow).not.toContain("npx playwright install-deps");
    expect(workflow).toContain("npm run test:e2e");
    expect(playwrightConfig).toContain('name: "desktop-chromium"');
    expect(playwrightConfig).toContain('name: "mobile-webkit"');
    expect(browserTests).toContain("new AxeBuilder({ page })");
    expect(browserTests).toContain('"wcag22aa"');
  });
});
