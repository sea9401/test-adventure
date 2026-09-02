import { describe, expect, it } from "vitest";

import { parseToolkitCommand, ToolkitUsageError } from "./command";

describe("parseToolkitCommand", () => {
  it("parses content creation without inventing defaults", () => {
    expect(
      parseToolkitCommand([
        "content",
        "create",
        "unexplored-boss",
        "--spec",
        "boss.yaml",
        "--dry-run",
      ]),
    ).toEqual({
      kind: "content-create",
      adapterId: "unexplored-boss",
      specPath: "boss.yaml",
      dryRun: true,
    });
  });

  it("rejects content creation without a spec path", () => {
    expect(() =>
      parseToolkitCommand(["content", "create", "unexplored-boss"]),
    ).toThrow("--spec is required");
  });

  it("parses every deterministic core command", () => {
    expect(parseToolkitCommand(["task", "resume", "boss-red"])).toEqual({
      kind: "task-resume",
      taskId: "boss-red",
      dryRun: false,
    });
    expect(
      parseToolkitCommand([
        "task",
        "scope",
        "add",
        "boss-red",
        "--paths",
        "src/a.ts, scripts/b.ts,src/a.ts",
      ]),
    ).toEqual({
      kind: "task-scope-add",
      taskId: "boss-red",
      paths: ["src/a.ts", "scripts/b.ts"],
      dryRun: false,
    });
    expect(
      parseToolkitCommand([
        "task",
        "approve",
        "boss-red",
        "--action",
        "deploy-test",
        "--target",
        "staging",
        "--reason",
        "테스트 서버 배포 요청",
      ]),
    ).toEqual({
      kind: "task-approve",
      taskId: "boss-red",
      action: "deploy-test",
      target: "staging",
      reason: "테스트 서버 배포 요청",
      dryRun: false,
    });
    expect(parseToolkitCommand(["verify", "full", "boss-red"])).toEqual({
      kind: "verify",
      level: "full",
      taskId: "boss-red",
      dryRun: false,
    });
    expect(parseToolkitCommand(["release", "pr", "boss-red"])).toEqual({
      kind: "release-pr",
      taskId: "boss-red",
      dryRun: false,
    });
    expect(
      parseToolkitCommand([
        "release",
        "deploy-test",
        "boss-red",
        "--dry-run",
      ]),
    ).toEqual({
      kind: "release-deploy-test",
      taskId: "boss-red",
      dryRun: true,
    });
  });

  it("parses image import and review commands", () => {
    expect(
      parseToolkitCommand([
        "images",
        "import",
        "boss-red",
        "--source-dir",
        "/tmp/boss-red-images",
        "--dry-run",
      ]),
    ).toEqual({
      kind: "images-import",
      taskId: "boss-red",
      sourceDir: "/tmp/boss-red-images",
      dryRun: true,
    });
    expect(
      parseToolkitCommand([
        "images",
        "review",
        "boss-red",
        "--role",
        "drop-rare",
        "--decision",
        "accept",
        "--reason",
        "투명 배경과 장비 실루엣 확인",
      ]),
    ).toEqual({
      kind: "images-review",
      taskId: "boss-red",
      role: "drop-rare",
      decision: "accept",
      reason: "투명 배경과 장비 실루엣 확인",
      dryRun: false,
    });
  });

  it("parses a task checkpoint without shell interpolation", () => {
    expect(
      parseToolkitCommand([
        "task",
        "checkpoint",
        "boss-red",
        "--message",
        "feat: add red boss",
        "--dry-run",
      ]),
    ).toEqual({
      kind: "task-checkpoint",
      taskId: "boss-red",
      message: "feat: add red boss",
      dryRun: true,
    });
  });

  it.each([
    [
      ["images", "import", "boss-red"],
      "--source-dir is required",
    ],
    [
      [
        "images",
        "review",
        "boss-red",
        "--role",
        "unknown",
        "--decision",
        "accept",
        "--reason",
        "확인",
      ],
      "image role must be boss, drop-30, drop-10, or drop-rare",
    ],
    [
      [
        "images",
        "review",
        "boss-red",
        "--role",
        "boss",
        "--decision",
        "maybe",
        "--reason",
        "확인",
      ],
      "image decision must be accept or reject",
    ],
  ])("rejects invalid image command %#", (argv, message) => {
    expect(() => parseToolkitCommand(argv)).toThrow(message);
  });

  it.each([
    {
      name: "an unknown flag",
      argv: ["task", "resume", "boss-red", "--force"],
      message: "unknown flag --force",
    },
    {
      name: "a duplicate flag",
      argv: [
        "content",
        "create",
        "unexplored-boss",
        "--spec",
        "one.yaml",
        "--spec",
        "two.yaml",
      ],
      message: "duplicate flag --spec",
    },
    {
      name: "a missing flag value",
      argv: ["content", "create", "unexplored-boss", "--spec"],
      message: "--spec requires a value",
    },
    {
      name: "an extra positional argument",
      argv: ["task", "resume", "boss-red", "extra"],
      message: "unexpected argument extra",
    },
    {
      name: "an empty scope path segment",
      argv: [
        "task",
        "scope",
        "add",
        "boss-red",
        "--paths",
        "src/a.ts,,scripts/b.ts",
      ],
      message: "--paths contains an empty path",
    },
  ])("rejects $name", ({ argv, message }) => {
    expect(() => parseToolkitCommand(argv)).toThrow(message);
  });

  it("reports invalid invocations as usage errors", () => {
    expect(() => parseToolkitCommand([])).toThrow(ToolkitUsageError);
    expect(() => parseToolkitCommand(["verify", "quick", "boss-red"])).toThrow(
      "verify level must be fast or full",
    );
  });
});
