import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("maintenance page refresh", () => {
  it("앱이나 점검 상태를 건드리지 않고 정적 대문만 교체한다", () => {
    const temporaryDirectory = mkdtempSync(
      join(tmpdir(), "maintenance-page-refresh-"),
    );
    const source = join(ROOT, "deploy/maintenance.html");
    const target = join(temporaryDirectory, "www", "maintenance.html");

    try {
      const output = execFileSync(
        "bash",
        [join(ROOT, "deploy/maintenance.sh"), "refresh-page"],
        {
          cwd: ROOT,
          encoding: "utf8",
          env: {
            ...process.env,
            PROJECT_DIR: ROOT,
            SUDO_CMD: "",
            MAINTENANCE_PAGE_SOURCE: source,
            MAINTENANCE_PAGE_TARGET: target,
          },
        },
      );

      expect(readFileSync(target, "utf8")).toBe(readFileSync(source, "utf8"));
      expect(output).toContain("앱 재시작 없음");
      expect(output).toContain("점검 모드 변경 없음");
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
