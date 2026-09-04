import { sha256Text } from "../core/hashes";
import type {
  CommandRequest,
  CommandResult,
  CommandRunnerLike,
} from "../core/commandRunner";

type FakeOutcome = {
  checkId: string;
  exitCode: number;
};

export class FakeCommandRunner implements CommandRunnerLike {
  private readonly outcomes: FakeOutcome[] = [];
  readonly runIds: string[] = [];

  succeed(checkId: string): this {
    this.outcomes.push({ checkId, exitCode: 0 });
    return this;
  }

  fail(checkId: string, exitCode: number): this {
    this.outcomes.push({ checkId, exitCode });
    return this;
  }

  async run(request: CommandRequest): Promise<CommandResult> {
    const outcome = this.outcomes.shift();
    if (outcome === undefined) {
      throw new Error(`no fake outcome queued for ${request.checkId}`);
    }
    if (outcome.checkId !== request.checkId) {
      throw new Error(
        `expected fake command ${outcome.checkId}, received ${request.checkId}`,
      );
    }
    this.runIds.push(request.checkId);
    return {
      exitCode: outcome.exitCode,
      signal: null,
      outputHash: sha256Text(`${request.checkId}:${outcome.exitCode}`),
      tailLines:
        outcome.exitCode === 0 ? [] : [`${request.checkId} failed in fake runner`],
      logPath: request.logPath,
    };
  }
}
