import { createInterface } from "node:readline/promises";

import {
  parseToolkitCommand,
  ToolkitUsageError,
  type ToolkitCommand,
} from "./command";

export type InteractiveIo = {
  ask(prompt: string): Promise<string | null>;
  write(message: string): void;
};

export type InteractiveAdapter = {
  id: string;
  label: string;
};

export type InteractiveCatalog = {
  adapters?: readonly InteractiveAdapter[];
  releasePr?: boolean;
  deployTest?: boolean;
};

type InteractiveSession = {
  io: InteractiveIo;
  close(): void;
};

export function shouldPromptInteractively(
  argv: readonly string[],
  ciValue: string | undefined,
  isTty: boolean | undefined,
): boolean {
  const normalizedCi = ciValue?.trim().toLowerCase();
  const isCi =
    normalizedCi !== undefined &&
    normalizedCi !== "" &&
    normalizedCi !== "false" &&
    normalizedCi !== "0";
  return argv.length === 0 && !isCi && isTty === true;
}

function cancelled(value: string | null): value is null | "취소" {
  return value === null || value.trim() === "취소";
}

async function choose(
  io: InteractiveIo,
  title: string,
  choices: readonly string[],
): Promise<string | null> {
  io.write(
    `${title}\n${choices
      .map((choice, index) => `  ${index + 1}. ${choice}`)
      .join("\n")}\n`,
  );
  const answer = await io.ask("> ");
  if (cancelled(answer)) {
    return null;
  }
  const trimmed = answer.trim();
  const numeric = Number(trimmed);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= choices.length) {
    return choices[numeric - 1];
  }
  if (choices.includes(trimmed)) {
    return trimmed;
  }
  throw new ToolkitUsageError(`unknown interactive choice: ${trimmed}`);
}

async function readValue(
  io: InteractiveIo,
  prompt: string,
): Promise<string | null> {
  const value = await io.ask(prompt);
  if (cancelled(value)) {
    return null;
  }
  if (value.trim() === "") {
    throw new ToolkitUsageError(`${prompt.trim()} cannot be empty`);
  }
  return value.trim();
}

async function readDryRun(io: InteractiveIo): Promise<boolean | null> {
  const mode = await choose(io, "실행 모드를 선택하세요.", [
    "실행",
    "dry-run",
    "취소",
  ]);
  if (mode === null || mode === "취소") {
    return null;
  }
  return mode === "dry-run";
}

function summarize(io: InteractiveIo, command: ToolkitCommand): ToolkitCommand {
  io.write(
    `대상: ${command.kind} / 모드: ${command.dryRun ? "dry-run" : "실행"}\n`,
  );
  return command;
}

function withDryRun(argv: string[], dryRun: boolean): string[] {
  return dryRun ? [...argv, "--dry-run"] : argv;
}

export async function promptForToolkitCommand(
  io: InteractiveIo,
  catalog: InteractiveCatalog = {},
): Promise<ToolkitCommand | null> {
  const adapters = catalog.adapters ?? [];
  const actions = [
    ...(adapters.length === 0 ? [] : ["콘텐츠 생성"]),
    "작업 재개",
    "이미지 가져오기",
    "이미지 검수",
    "수동 범위 추가",
    "승인 기록",
    "빠른 검증",
    "전체 검증",
    ...(catalog.releasePr ? ["PR 준비"] : []),
    ...(catalog.deployTest ? ["테스트 서버 배포"] : []),
    "취소",
  ];
  const action = await choose(io, "프로젝트 툴킷 작업을 선택하세요.", actions);
  if (action === null || action === "취소") {
    return null;
  }

  if (action === "콘텐츠 생성") {
    const label = await choose(
      io,
      "콘텐츠 종류를 선택하세요.",
      adapters.map((adapter) => adapter.label),
    );
    if (label === null) {
      return null;
    }
    const adapter = adapters.find((candidate) => candidate.label === label)!;
    const specPath = await readValue(io, "명세 YAML 경로: ");
    if (specPath === null) {
      return null;
    }
    const dryRun = await readDryRun(io);
    if (dryRun === null) {
      return null;
    }
    return summarize(
      io,
      parseToolkitCommand(
        withDryRun(
          ["content", "create", adapter.id, "--spec", specPath],
          dryRun,
        ),
      ),
    );
  }

  const taskId = await readValue(io, "작업 ID: ");
  if (taskId === null) {
    return null;
  }
  let argv: string[];
  switch (action) {
    case "작업 재개":
      argv = ["task", "resume", taskId];
      break;
    case "이미지 가져오기": {
      const sourceDir = await readValue(io, "이미지 원본 디렉터리: ");
      if (sourceDir === null) {
        return null;
      }
      argv = ["images", "import", taskId, "--source-dir", sourceDir];
      break;
    }
    case "이미지 검수": {
      const role = await choose(io, "이미지 역할을 선택하세요.", [
        "boss",
        "drop-30",
        "drop-10",
        "drop-rare",
      ]);
      const decision = await choose(io, "검수 결과를 선택하세요.", [
        "accept",
        "reject",
      ]);
      const reason = await readValue(io, "검수 사유: ");
      if (role === null || decision === null || reason === null) {
        return null;
      }
      argv = [
        "images",
        "review",
        taskId,
        "--role",
        role,
        "--decision",
        decision,
        "--reason",
        reason,
      ];
      break;
    }
    case "수동 범위 추가": {
      const paths = await readValue(io, "프로젝트 경로(쉼표 구분): ");
      if (paths === null) {
        return null;
      }
      argv = ["task", "scope", "add", taskId, "--paths", paths];
      break;
    }
    case "승인 기록": {
      const actionName = await readValue(io, "승인 작업: ");
      const target = await readValue(io, "승인 대상: ");
      const reason = await readValue(io, "승인 사유: ");
      if (actionName === null || target === null || reason === null) {
        return null;
      }
      argv = [
        "task",
        "approve",
        taskId,
        "--action",
        actionName,
        "--target",
        target,
        "--reason",
        reason,
      ];
      break;
    }
    case "빠른 검증":
      argv = ["verify", "fast", taskId];
      break;
    case "전체 검증":
      argv = ["verify", "full", taskId];
      break;
    case "PR 준비":
      argv = ["release", "pr", taskId];
      break;
    case "테스트 서버 배포":
      argv = ["release", "deploy-test", taskId];
      break;
    default:
      throw new ToolkitUsageError(`unsupported interactive action: ${action}`);
  }
  const dryRun = await readDryRun(io);
  if (dryRun === null) {
    return null;
  }
  return summarize(io, parseToolkitCommand(withDryRun(argv, dryRun)));
}

export function createReadlineInteractiveIo(): InteractiveSession {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return {
    io: {
      ask: async (prompt) => {
        try {
          return await readline.question(prompt);
        } catch {
          return null;
        }
      },
      write: (message) => process.stdout.write(message),
    },
    close: () => readline.close(),
  };
}
