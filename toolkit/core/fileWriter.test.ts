import {
  chmod,
  lstat,
  mkdir,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ArtifactPlan } from "./artifacts";
import {
  applyArtifactWrites,
  nodeFileWriterOperations,
  planArtifactWrites,
  verifyArtifactRecords,
} from "./fileWriter";
import { createFixtureWorkspace } from "../testing/fixtureWorkspace";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

function createText(path: string, content: string): ArtifactPlan {
  return { scope: "project", path, operation: "create", content };
}

async function workspace(): Promise<string> {
  const fixture = await createFixtureWorkspace();
  cleanups.push(fixture.cleanup);
  return fixture.root;
}

describe("planArtifactWrites", () => {
  it("returns an empty second write plan", async () => {
    const root = await workspace();
    const first = await planArtifactWrites(
      root,
      [createText("src/generated.ts", "export const n = 1;\n")],
      [],
    );
    const records = await applyArtifactWrites(root, first);

    const second = await planArtifactWrites(root, first.plans, records);

    expect(second.changes).toEqual([]);
  });

  it("refuses to overwrite a user-edited generated file", async () => {
    const root = await workspace();
    const first = await planArtifactWrites(
      root,
      [createText("src/generated.ts", "first\n")],
      [],
    );
    const records = await applyArtifactWrites(root, first);
    await writeFile(join(root, "src/generated.ts"), "user edit\n");

    await expect(
      planArtifactWrites(
        root,
        [createText("src/generated.ts", "second\n")],
        records,
      ),
    ).rejects.toThrow("src/generated.ts changed outside toolkit ownership");
  });

  it("does not adopt an existing unowned file even when bytes match", async () => {
    const root = await workspace();
    await writeFile(join(root, "src/generated.ts"), "same\n");

    await expect(
      planArtifactWrites(
        root,
        [createText("src/generated.ts", "same\n")],
        [],
      ),
    ).rejects.toThrow("src/generated.ts already exists without toolkit ownership");
  });

  it("adopts an AST-validated existing file only through replace-owned", async () => {
    const root = await workspace();
    await writeFile(join(root, "src/catalog.ts"), "export const old = 1;\n");
    const preview = await planArtifactWrites(
      root,
      [
        {
          scope: "project",
          path: "src/catalog.ts",
          operation: "replace-owned",
          ownershipKey: "catalog:v1",
          content: "export const old = 1;\nexport const generated = 2;\n",
        },
      ],
      [],
    );

    const records = await applyArtifactWrites(root, preview);

    expect(await readFile(join(root, "src/catalog.ts"), "utf8")).toContain(
      "generated = 2",
    );
    await expect(
      verifyArtifactRecords(root, "boss-red", records),
    ).resolves.toBeUndefined();
    await writeFile(join(root, "src/catalog.ts"), "user edit\n");
    await expect(verifyArtifactRecords(root, "boss-red", records)).rejects.toThrow(
      "src/catalog.ts changed outside toolkit ownership",
    );
  });

  it("rejects duplicate targets and replace-owned without an ownership key", async () => {
    const root = await workspace();
    await expect(
      planArtifactWrites(
        root,
        [
          createText("src/generated.ts", "one\n"),
          createText("src/generated.ts", "two\n"),
        ],
        [],
      ),
    ).rejects.toThrow("duplicate artifact path");

    await expect(
      planArtifactWrites(
        root,
        [
          {
            scope: "project",
            path: "src/generated.ts",
            operation: "replace-owned",
            content: "new\n",
          },
        ],
        [],
      ),
    ).rejects.toThrow("replace-owned requires an ownership key");
  });

  it.each(["../outside.ts", "/tmp/outside.ts", "src/../../outside.ts"])(
    "rejects unsafe artifact path %s",
    async (path) => {
      const root = await workspace();
      await expect(
        planArtifactWrites(root, [createText(path, "unsafe\n")], []),
      ).rejects.toThrow("unsafe artifact path");
    },
  );

  it("rejects a symlink escape", async () => {
    const root = await workspace();
    const outside = await workspace();
    await symlink(outside, join(root, "src/linked"));

    await expect(
      planArtifactWrites(
        root,
        [createText("src/linked/generated.ts", "unsafe\n")],
        [],
      ),
    ).rejects.toThrow("artifact path escapes its root through a symlink");
  });

  it("keeps task-scoped artifacts under the selected local task", async () => {
    const root = await workspace();
    const preview = await planArtifactWrites(
      root,
      [
        {
          scope: "task",
          path: "reports/preview.txt",
          operation: "create",
          content: "local only\n",
        },
      ],
      [],
      { taskId: "boss-red" },
    );

    await applyArtifactWrites(root, preview);

    await expect(
      readFile(
        join(root, ".toolkit/work/boss-red/reports/preview.txt"),
        "utf8",
      ),
    ).resolves.toBe("local only\n");
  });

  it("does not mutate the filesystem while building a preview", async () => {
    const root = await workspace();
    const target = join(root, "src/generated.ts");

    const preview = await planArtifactWrites(
      root,
      [createText("src/generated.ts", "preview\n")],
      [],
    );

    expect(preview.changes).toHaveLength(1);
    await expect(readFile(target)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("applyArtifactWrites", () => {
  it("writes binary content and returns its ownership record", async () => {
    const root = await workspace();
    await mkdir(join(root, "public/images"), { recursive: true });
    const content = Uint8Array.from([0, 1, 2, 255]);
    const preview = await planArtifactWrites(
      root,
      [
        {
          scope: "project",
          path: "public/images/generated.bin",
          operation: "create",
          content,
        },
      ],
      [],
    );

    const records = await applyArtifactWrites(root, preview);

    expect(await readFile(join(root, "public/images/generated.bin"))).toEqual(
      Buffer.from(content),
    );
    expect(records).toMatchObject([
      {
        scope: "project",
        path: "public/images/generated.bin",
        operation: "create",
        byteLength: 4,
      },
    ]);
    expect(records[0].outputHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("preserves the mode of an owned file when replacing its bytes", async () => {
    const root = await workspace();
    const first = await planArtifactWrites(
      root,
      [createText("scripts/generated.ts", "old\n")],
      [],
    );
    const records = await applyArtifactWrites(root, first);
    await chmod(join(root, "scripts/generated.ts"), 0o755);
    const update = await planArtifactWrites(
      root,
      [createText("scripts/generated.ts", "new\n")],
      records,
    );

    await applyArtifactWrites(root, update);

    expect((await lstat(join(root, "scripts/generated.ts"))).mode & 0o777).toBe(
      0o755,
    );
  });

  it("restores every earlier target after a mid-apply rename failure", async () => {
    const root = await workspace();
    const original = [
      createText("src/a.ts", "old a\n"),
      createText("src/b.ts", "old b\n"),
    ];
    const seeded = await planArtifactWrites(root, original, []);
    const records = await applyArtifactWrites(root, seeded);
    const update = await planArtifactWrites(
      root,
      [
        createText("src/a.ts", "new a\n"),
        createText("src/b.ts", "new b\n"),
      ],
      records,
    );
    let renameCalls = 0;

    await expect(
      applyArtifactWrites(root, update, {
        ...nodeFileWriterOperations,
        rename: async (source, target) => {
          renameCalls += 1;
          if (renameCalls === 2) {
            throw new Error("simulated rename failure");
          }
          await nodeFileWriterOperations.rename(source, target);
        },
      }),
    ).rejects.toThrow("simulated rename failure");

    await expect(readFile(join(root, "src/a.ts"), "utf8")).resolves.toBe(
      "old a\n",
    );
    await expect(readFile(join(root, "src/b.ts"), "utf8")).resolves.toBe(
      "old b\n",
    );
  });

  it("removes task directories created by a failed apply", async () => {
    const root = await workspace();
    const preview = await planArtifactWrites(
      root,
      [
        {
          scope: "task",
          path: "reports/preview.txt",
          operation: "create",
          content: "temporary\n",
        },
        createText("src/generated.ts", "project\n"),
      ],
      [],
      { taskId: "boss-red" },
    );
    let renameCalls = 0;

    await expect(
      applyArtifactWrites(root, preview, {
        ...nodeFileWriterOperations,
        rename: async (source, target) => {
          renameCalls += 1;
          if (renameCalls === 2) {
            throw new Error("simulated rename failure");
          }
          await nodeFileWriterOperations.rename(source, target);
        },
      }),
    ).rejects.toThrow("simulated rename failure");

    await expect(lstat(join(root, ".toolkit"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(lstat(join(root, "src/generated.ts"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
