import {
  parseToolkitCommand,
  toolkitUsage,
  ToolkitUsageError,
} from "./command";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

import { AdapterRegistry } from "../core/adapterRegistry";
import { CommandRunner } from "../core/commandRunner";
import { TaskStateStore } from "../core/taskState";
import {
  createReadlineInteractiveIo,
  promptForToolkitCommand,
  shouldPromptInteractively,
} from "./interactive";
import { executeToolkitCommand } from "./runtime";

const execFileAsync = promisify(execFile);

async function main(argv: readonly string[]): Promise<void> {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    process.stdout.write(`${toolkitUsage()}\n`);
    return;
  }

  try {
    const registry = new AdapterRegistry();
    let command;
    if (shouldPromptInteractively(argv, process.env.CI, process.stdin.isTTY)) {
      const session = createReadlineInteractiveIo();
      try {
        command = await promptForToolkitCommand(session.io, {
          adapters: registry.list().map((adapter) => ({
            id: adapter.id,
            label: adapter.id,
          })),
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
      projectRoot: process.cwd(),
      registry,
      store: new TaskStateStore(process.cwd()),
      runner: new CommandRunner(),
      resolveBaseSha: async () => {
        const result = await execFileAsync("git", ["rev-parse", "HEAD"], {
          cwd: process.cwd(),
          encoding: "utf8",
        });
        return result.stdout.trim();
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
