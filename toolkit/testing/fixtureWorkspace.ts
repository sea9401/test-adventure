import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type FixtureWorkspace = {
  root: string;
  cleanup(): Promise<void>;
};

export async function createFixtureWorkspace(): Promise<FixtureWorkspace> {
  const root = await mkdtemp(join(tmpdir(), "project-toolkit-fixture-"));
  await Promise.all([
    mkdir(join(root, "src"), { recursive: true }),
    mkdir(join(root, "scripts"), { recursive: true }),
  ]);
  return {
    root,
    cleanup: () => rm(root, { force: true, recursive: true }),
  };
}
