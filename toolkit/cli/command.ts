export type ToolkitCommand =
  | {
      kind: "content-create";
      adapterId: string;
      specPath: string;
      dryRun: boolean;
    }
  | { kind: "task-resume"; taskId: string; dryRun: boolean }
  | {
      kind: "images-import";
      taskId: string;
      sourceDir: string;
      dryRun: boolean;
    }
  | {
      kind: "images-review";
      taskId: string;
      role: "boss" | "drop-30" | "drop-10" | "drop-rare";
      decision: "accept" | "reject";
      reason: string;
      dryRun: boolean;
    }
  | {
      kind: "task-scope-add";
      taskId: string;
      paths: readonly string[];
      dryRun: boolean;
    }
  | {
      kind: "task-approve";
      taskId: string;
      action: string;
      target: string;
      reason: string;
      dryRun: boolean;
    }
  | {
      kind: "verify";
      level: "fast" | "full";
      taskId: string;
      dryRun: boolean;
    }
  | { kind: "release-pr"; taskId: string; dryRun: boolean }
  | { kind: "release-deploy-test"; taskId: string; dryRun: boolean };

export class ToolkitUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolkitUsageError";
  }
}

type ParsedTail = {
  positionals: readonly string[];
  values: ReadonlyMap<string, string>;
  dryRun: boolean;
};

function parseTail(
  argv: readonly string[],
  allowedValueFlags: readonly string[],
): ParsedTail {
  const allowed = new Set(allowedValueFlags);
  const seen = new Set<string>();
  const values = new Map<string, string>();
  const positionals: string[] = [];
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }

    if (seen.has(argument)) {
      throw new ToolkitUsageError(`duplicate flag ${argument}`);
    }
    seen.add(argument);

    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (!allowed.has(argument)) {
      throw new ToolkitUsageError(`unknown flag ${argument}`);
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new ToolkitUsageError(`${argument} requires a value`);
    }
    if (value.trim() === "") {
      throw new ToolkitUsageError(`${argument} cannot be empty`);
    }
    values.set(argument, value);
    index += 1;
  }

  return { positionals, values, dryRun };
}

function requireIdentifier(value: string | undefined, label: string): string {
  if (value === undefined || value.trim() === "") {
    throw new ToolkitUsageError(`${label} is required`);
  }
  return value;
}

function requireFlag(values: ReadonlyMap<string, string>, flag: string): string {
  const value = values.get(flag);
  if (value === undefined) {
    throw new ToolkitUsageError(`${flag} is required`);
  }
  return value;
}

function requirePositionals(
  positionals: readonly string[],
  labels: readonly string[],
): readonly string[] {
  for (let index = 0; index < labels.length; index += 1) {
    requireIdentifier(positionals[index], labels[index]);
  }
  if (positionals.length > labels.length) {
    throw new ToolkitUsageError(
      `unexpected argument ${positionals[labels.length]}`,
    );
  }
  return positionals;
}

function parseContentCreate(argv: readonly string[]): ToolkitCommand {
  const parsed = parseTail(argv, ["--spec"]);
  const [adapterId] = requirePositionals(parsed.positionals, ["adapter id"]);
  return {
    kind: "content-create",
    adapterId,
    specPath: requireFlag(parsed.values, "--spec"),
    dryRun: parsed.dryRun,
  };
}

function parseTaskResume(argv: readonly string[]): ToolkitCommand {
  const parsed = parseTail(argv, []);
  const [taskId] = requirePositionals(parsed.positionals, ["task id"]);
  return { kind: "task-resume", taskId, dryRun: parsed.dryRun };
}

function parseTaskScopeAdd(argv: readonly string[]): ToolkitCommand {
  const parsed = parseTail(argv, ["--paths"]);
  const [taskId] = requirePositionals(parsed.positionals, ["task id"]);
  const rawPaths = requireFlag(parsed.values, "--paths").split(",");
  if (rawPaths.some((path) => path.trim() === "")) {
    throw new ToolkitUsageError("--paths contains an empty path");
  }

  return {
    kind: "task-scope-add",
    taskId,
    paths: [...new Set(rawPaths.map((path) => path.trim()))],
    dryRun: parsed.dryRun,
  };
}

function parseTaskApprove(argv: readonly string[]): ToolkitCommand {
  const parsed = parseTail(argv, ["--action", "--target", "--reason"]);
  const [taskId] = requirePositionals(parsed.positionals, ["task id"]);
  return {
    kind: "task-approve",
    taskId,
    action: requireFlag(parsed.values, "--action"),
    target: requireFlag(parsed.values, "--target"),
    reason: requireFlag(parsed.values, "--reason"),
    dryRun: parsed.dryRun,
  };
}

function parseVerify(argv: readonly string[]): ToolkitCommand {
  const parsed = parseTail(argv, []);
  const [level, taskId] = requirePositionals(parsed.positionals, [
    "verify level",
    "task id",
  ]);
  if (level !== "fast" && level !== "full") {
    throw new ToolkitUsageError("verify level must be fast or full");
  }
  return { kind: "verify", level, taskId, dryRun: parsed.dryRun };
}

function parseImagesImport(argv: readonly string[]): ToolkitCommand {
  const parsed = parseTail(argv, ["--source-dir"]);
  const [taskId] = requirePositionals(parsed.positionals, ["task id"]);
  const sourceDir = requireFlag(parsed.values, "--source-dir");
  if (sourceDir.includes("://")) {
    throw new ToolkitUsageError("--source-dir must be a local filesystem path");
  }
  return { kind: "images-import", taskId, sourceDir, dryRun: parsed.dryRun };
}

function parseImagesReview(argv: readonly string[]): ToolkitCommand {
  const parsed = parseTail(argv, ["--role", "--decision", "--reason"]);
  const [taskId] = requirePositionals(parsed.positionals, ["task id"]);
  const role = requireFlag(parsed.values, "--role");
  if (
    role !== "boss" &&
    role !== "drop-30" &&
    role !== "drop-10" &&
    role !== "drop-rare"
  ) {
    throw new ToolkitUsageError(
      "image role must be boss, drop-30, drop-10, or drop-rare",
    );
  }
  const decision = requireFlag(parsed.values, "--decision");
  if (decision !== "accept" && decision !== "reject") {
    throw new ToolkitUsageError("image decision must be accept or reject");
  }
  return {
    kind: "images-review",
    taskId,
    role,
    decision,
    reason: requireFlag(parsed.values, "--reason"),
    dryRun: parsed.dryRun,
  };
}

function parseRelease(
  releaseKind: "pr" | "deploy-test",
  argv: readonly string[],
): ToolkitCommand {
  const parsed = parseTail(argv, []);
  const [taskId] = requirePositionals(parsed.positionals, ["task id"]);
  return releaseKind === "pr"
    ? { kind: "release-pr", taskId, dryRun: parsed.dryRun }
    : { kind: "release-deploy-test", taskId, dryRun: parsed.dryRun };
}

export function parseToolkitCommand(argv: readonly string[]): ToolkitCommand {
  if (argv[0] === "content" && argv[1] === "create") {
    return parseContentCreate(argv.slice(2));
  }
  if (argv[0] === "task" && argv[1] === "resume") {
    return parseTaskResume(argv.slice(2));
  }
  if (argv[0] === "task" && argv[1] === "scope" && argv[2] === "add") {
    return parseTaskScopeAdd(argv.slice(3));
  }
  if (argv[0] === "task" && argv[1] === "approve") {
    return parseTaskApprove(argv.slice(2));
  }
  if (argv[0] === "verify") {
    return parseVerify(argv.slice(1));
  }
  if (argv[0] === "images" && argv[1] === "import") {
    return parseImagesImport(argv.slice(2));
  }
  if (argv[0] === "images" && argv[1] === "review") {
    return parseImagesReview(argv.slice(2));
  }
  if (argv[0] === "release" && argv[1] === "pr") {
    return parseRelease("pr", argv.slice(2));
  }
  if (argv[0] === "release" && argv[1] === "deploy-test") {
    return parseRelease("deploy-test", argv.slice(2));
  }

  throw new ToolkitUsageError("unknown or missing toolkit command");
}

export function toolkitUsage(): string {
  return [
    "Usage:",
    "  npm run toolkit -- content create <adapter> --spec <path> [--dry-run]",
    "  npm run toolkit -- task resume <task-id> [--dry-run]",
    "  npm run toolkit -- task scope add <task-id> --paths <path,...> [--dry-run]",
    "  npm run toolkit -- task approve <task-id> --action <action> --target <target> --reason <reason> [--dry-run]",
    "  npm run toolkit -- images import <task-id> --source-dir <path> [--dry-run]",
    "  npm run toolkit -- images review <task-id> --role <role> --decision <accept|reject> --reason <reason> [--dry-run]",
    "  npm run toolkit -- verify <fast|full> <task-id> [--dry-run]",
    "  npm run toolkit -- release <pr|deploy-test> <task-id> [--dry-run]",
  ].join("\n");
}
