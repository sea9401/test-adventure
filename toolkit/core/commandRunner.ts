import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";

const INHERITED_ENV_KEYS = [
  "PATH",
  "HOME",
  "USER",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "TERM",
  "CI",
  "NODE_OPTIONS",
  "NODE_PATH",
  "SystemRoot",
  "ComSpec",
  "PATHEXT",
] as const;
const SECRET_ENV_NAME = /(TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|CREDENTIAL)/i;
const MAX_TAIL_LINES = 200;
const MAX_SUMMARY_LINE_LENGTH = 500;

export type CommandRequest = {
  checkId: string;
  command: string;
  args: readonly string[];
  cwd: string;
  env?: Readonly<Record<string, string>>;
  logPath: string;
  redactValues?: readonly string[];
};

export type CommandResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  outputHash: string;
  tailLines: readonly string[];
  logPath: string;
};

export type CommandRunnerLike = {
  run(request: CommandRequest): Promise<CommandResult>;
};

function childEnvironment(
  additional: Readonly<Record<string, string>> = {},
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV ?? "development",
  };
  for (const key of INHERITED_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) {
      environment[key] = value;
    }
  }
  return { ...environment, ...additional };
}

function redactionValues(request: CommandRequest): readonly string[] {
  const values = [
    ...(request.redactValues ?? []),
    ...Object.entries(request.env ?? {})
      .filter(([key]) => SECRET_ENV_NAME.test(key))
      .map(([, value]) => value),
  ];
  return [...new Set(values.filter((value) => value.length > 0))].sort(
    (left, right) => right.length - left.length,
  );
}

function sanitizeLine(line: string, secrets: readonly string[]): string {
  let sanitized = line;
  for (const secret of secrets) {
    sanitized = sanitized.split(secret).join("[REDACTED]");
  }
  sanitized = sanitized
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/\b(?:gh[opsu]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]+)\b/g, "[REDACTED]");
  return sanitized.length <= MAX_SUMMARY_LINE_LENGTH
    ? sanitized
    : `${sanitized.slice(0, MAX_SUMMARY_LINE_LENGTH)}…`;
}

export class CommandRunner implements CommandRunnerLike {
  async run(request: CommandRequest): Promise<CommandResult> {
    await mkdir(dirname(request.logPath), { recursive: true });
    const logHandle = await open(request.logPath, "w", 0o600);
    const outputHash = createHash("sha256");
    const secrets = redactionValues(request);
    const tailLines: string[] = [];
    const partial: Record<"stdout" | "stderr", string> = {
      stdout: "",
      stderr: "",
    };
    let writeChain: Promise<unknown> = Promise.resolve();

    const retainLine = (line: string): void => {
      tailLines.push(sanitizeLine(line, secrets));
      if (tailLines.length > MAX_TAIL_LINES) {
        tailLines.splice(0, tailLines.length - MAX_TAIL_LINES);
      }
    };
    const consume = (stream: "stdout" | "stderr", chunk: Buffer): void => {
      outputHash.update(stream);
      outputHash.update(chunk);
      writeChain = writeChain.then(() => logHandle.write(chunk));
      const lines = `${partial[stream]}${chunk.toString("utf8")}`.split(/\r?\n/);
      partial[stream] = lines.pop() ?? "";
      for (const line of lines) {
        retainLine(line);
      }
    };

    return new Promise<CommandResult>((resolvePromise, rejectPromise) => {
      let settled = false;
      const finish = async (
        result:
          | { kind: "close"; exitCode: number | null; signal: NodeJS.Signals | null }
          | { kind: "error"; error: Error },
      ): Promise<void> => {
        if (settled) {
          return;
        }
        settled = true;
        for (const stream of ["stdout", "stderr"] as const) {
          if (partial[stream] !== "") {
            retainLine(partial[stream]);
          }
        }
        try {
          await writeChain;
          await logHandle.sync();
          await logHandle.close();
        } catch (error) {
          rejectPromise(error);
          return;
        }
        if (result.kind === "error") {
          rejectPromise(
            new Error(`could not start ${request.checkId}: ${result.error.message}`, {
              cause: result.error,
            }),
          );
          return;
        }
        resolvePromise({
          exitCode: result.exitCode,
          signal: result.signal,
          outputHash: outputHash.digest("hex"),
          tailLines,
          logPath: request.logPath,
        });
      };

      let child;
      try {
        child = spawn(request.command, [...request.args], {
          cwd: request.cwd,
          env: childEnvironment(request.env),
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        void finish({
          kind: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        });
        return;
      }

      child.stdout.on("data", (chunk: Buffer) => consume("stdout", chunk));
      child.stderr.on("data", (chunk: Buffer) => consume("stderr", chunk));
      child.once("error", (error) => void finish({ kind: "error", error }));
      child.once("close", (exitCode, signal) =>
        void finish({ kind: "close", exitCode, signal }),
      );
    });
  }
}
