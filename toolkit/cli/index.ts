import {
  parseToolkitCommand,
  toolkitUsage,
  ToolkitUsageError,
} from "./command";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

import { CommandRunner } from "../core/commandRunner";
import { TaskStateStore } from "../core/taskState";
import { runStagingRelease } from "../pipelines/stagingRelease";
import {
  createReadlineInteractiveIo,
  promptForToolkitCommand,
  shouldPromptInteractively,
} from "./interactive";
import {
  createDefaultAdapterRegistry,
  executeToolkitCommand,
} from "./runtime";

const execFileAsync = promisify(execFile);

async function main(argv: readonly string[]): Promise<void> {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    process.stdout.write(`${toolkitUsage()}\n`);
    return;
  }

  try {
    const registry = createDefaultAdapterRegistry();
    const projectRoot = process.cwd();
    const store = new TaskStateStore(projectRoot);
    const report = (message: string) => process.stdout.write(`${message}\n`);
    let command;
    if (shouldPromptInteractively(argv, process.env.CI, process.stdin.isTTY)) {
      const session = createReadlineInteractiveIo();
      try {
        command = await promptForToolkitCommand(session.io, {
          adapters: registry.list().map((adapter) => ({
            id: adapter.id,
            label: adapter.displayName ?? adapter.id,
          })),
          releasePr: true,
          deployTest: true,
        });
      } finally {
        session.close();
      }
      if (command === null) {
        return;
      }
    } else {
      command = parseToolkitCommand(argv);
    }
    process.exitCode = await executeToolkitCommand(command, {
      projectRoot,
      registry,
      store,
      runner: new CommandRunner(),
      report,
      resolveBaseSha: async () => {
        const result = await execFileAsync("git", ["rev-parse", "HEAD"], {
          cwd: projectRoot,
          encoding: "utf8",
        });
        return result.stdout.trim();
      },
      releaseHandlers: {
        pr: async (taskId, dryRun) => {
          await runStagingRelease(taskId, "pr-open", dryRun, {
            projectRoot,
            store,
            report,
          });
          return 0;
        },
        deployTest: async (taskId, dryRun) => {
          await runStagingRelease(taskId, "public-verified", dryRun, {
            projectRoot,
            store,
            report,
          });
          return 0;
        },
      },
    });
  } catch (error) {
    if (error instanceof ToolkitUsageError) {
      process.stderr.write(`${error.message}\n\n${toolkitUsage()}\n`);
      process.exitCode = 2;
      return;
    }
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

void main(process.argv.slice(2));
