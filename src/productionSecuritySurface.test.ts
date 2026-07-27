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

  it("개발 UI와 출시 전 코인 상점이 운영 설정에서 닫혀 있다", () => {
    const devLayout = source(join(ROOT, "src/app/dev/layout.tsx"));
    expect(devLayout).toContain('process.env.NODE_ENV === "production"');
    expect(devLayout).toContain('process.env.IS_STAGING !== "true"');
    expect(devLayout).toContain("notFound()");

    const productionEnv = source(join(ROOT, ".env.production"));
    expect(productionEnv).toMatch(
      /^NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN=false$/m,
    );

    const proxy = source(join(ROOT, "src/proxy.ts"));
    expect(proxy).toContain('req.nextUrl.pathname === "/settings/coin-shop"');
    expect(proxy).toContain(
      'req.nextUrl.pathname === "/api/v2/museun-coin-shop"',
    );
    expect(proxy).toMatch(/status:\s*404/);
  });

  it("배포가 최신 크론 목록을 설치하고 개인정보 정리 작업을 확인한다", () => {
    for (const path of [
      join(ROOT, ".github/workflows/deploy.yml"),
      join(ROOT, "deploy/deploy.sh"),
    ]) {
      const contents = source(path);
      expect(contents, relative(ROOT, path)).toContain(
        "crontab deploy/crontab.txt",
      );
      expect(contents, relative(ROOT, path)).toContain(
        "/api/v2/cron/ops-retention",
      );
      expect(contents, relative(ROOT, path)).toContain(
        "/api/v2/cron/ops-daily-report",
      );
    }
  });
});
