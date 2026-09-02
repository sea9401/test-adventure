import {
  parseToolkitCommand,
  toolkitUsage,
  ToolkitUsageError,
} from "./command";

function main(argv: readonly string[]): void {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    process.stdout.write(`${toolkitUsage()}\n`);
    return;
  }

  try {
    parseToolkitCommand(argv);
  } catch (error) {
    if (error instanceof ToolkitUsageError) {
      process.stderr.write(`${error.message}\n\n${toolkitUsage()}\n`);
      process.exitCode = 2;
      return;
    }
    throw error;
  }
}

main(process.argv.slice(2));
