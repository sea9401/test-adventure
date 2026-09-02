import { describe, expect, it } from "vitest";

import {
  promptForToolkitCommand,
  shouldPromptInteractively,
  type InteractiveIo,
} from "./interactive";

function scriptedIo(answers: readonly string[]) {
  const remaining = [...answers];
  const output: string[] = [];
  const io: InteractiveIo = {
    ask: async () => remaining.shift() ?? null,
    write: (message) => output.push(message),
  };
  return { io, output };
}

describe("promptForToolkitCommand", () => {
  it("maps guided answers to the same deterministic command", async () => {
    const scripted = scriptedIo([
      "콘텐츠 생성",
      "미개척지 개인 보스",
      "boss.yaml",
      "dry-run",
    ]);

    const command = await promptForToolkitCommand(scripted.io, {
      adapters: [
        { id: "unexplored-boss", label: "미개척지 개인 보스" },
      ],
    });

    expect(command).toEqual({
      kind: "content-create",
      adapterId: "unexplored-boss",
      specPath: "boss.yaml",
      dryRun: true,
    });
    expect(scripted.output.at(-1)).toContain(
      "대상: content-create / 모드: dry-run",
    );
  });

  it("returns null on cancellation without asking for more input", async () => {
    const scripted = scriptedIo(["취소", "should-not-be-read"]);
    await expect(promptForToolkitCommand(scripted.io)).resolves.toBeNull();
  });

  it("hides content and release choices that have no registered handler", async () => {
    const scripted = scriptedIo(["작업 재개", "boss-red", "실행"]);

    await promptForToolkitCommand(scripted.io, {
      adapters: [],
      releasePr: false,
      deployTest: false,
    });

    const menu = scripted.output[0];
    expect(menu).not.toContain("콘텐츠 생성");
    expect(menu).not.toContain("PR 준비");
    expect(menu).not.toContain("테스트 서버 배포");
  });

  it("builds scope and approval commands through the strict parser", async () => {
    const scope = scriptedIo([
      "수동 범위 추가",
      "boss-red",
      "src/a.ts, scripts/b.ts",
      "실행",
    ]);
    await expect(promptForToolkitCommand(scope.io)).resolves.toEqual({
      kind: "task-scope-add",
      taskId: "boss-red",
      paths: ["src/a.ts", "scripts/b.ts"],
      dryRun: false,
    });

    const approval = scriptedIo([
      "승인 기록",
      "boss-red",
      "deploy-test",
      "staging",
      "테스트 서버 배포 요청",
      "실행",
    ]);
    await expect(promptForToolkitCommand(approval.io)).resolves.toEqual({
      kind: "task-approve",
      taskId: "boss-red",
      action: "deploy-test",
      target: "staging",
      reason: "테스트 서버 배포 요청",
      dryRun: false,
    });
  });

  it("builds image import and review commands through the same parser", async () => {
    const imageImport = scriptedIo([
      "이미지 가져오기",
      "boss-red",
      "/tmp/boss-red-images",
      "dry-run",
    ]);
    await expect(promptForToolkitCommand(imageImport.io)).resolves.toEqual({
      kind: "images-import",
      taskId: "boss-red",
      sourceDir: "/tmp/boss-red-images",
      dryRun: true,
    });

    const review = scriptedIo([
      "이미지 검수",
      "boss-red",
      "drop-rare",
      "reject",
      "실루엣 재작업 필요",
      "실행",
    ]);
    await expect(promptForToolkitCommand(review.io)).resolves.toEqual({
      kind: "images-review",
      taskId: "boss-red",
      role: "drop-rare",
      decision: "reject",
      reason: "실루엣 재작업 필요",
      dryRun: false,
    });
  });
});

describe("shouldPromptInteractively", () => {
  it("prompts only for a local TTY invocation without positional arguments", () => {
    expect(shouldPromptInteractively([], undefined, true)).toBe(true);
    expect(shouldPromptInteractively(["verify"], undefined, true)).toBe(false);
    expect(shouldPromptInteractively([], undefined, false)).toBe(false);
    expect(shouldPromptInteractively([], "true", true)).toBe(false);
    expect(shouldPromptInteractively([], "1", true)).toBe(false);
  });
});
