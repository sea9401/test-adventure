import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// 자바스크립트 빌드 검사기를 그대로 검증한다.
import { scanClientCookingSecrets } from "../../scripts/check-client-cooking-secrets.mjs";

const temporaryDirectories: string[] = [];

async function chunksDirectory() {
  const root = await mkdtemp(join(tmpdir(), "cooking-client-secrets-"));
  temporaryDirectories.push(root);
  const chunks = join(root, "static", "chunks");
  await mkdir(chunks, { recursive: true });
  return chunks;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("client cooking secret scanner", () => {
  it("안전한 클라이언트 청크는 통과시킨다", async () => {
    const chunks = await chunksDirectory();
    await writeFile(join(chunks, "safe.js"), "const title='미발견 레시피';\n");

    const result = await scanClientCookingSecrets(chunks);

    expect(result.leaks).toEqual([]);
  });

  it("미발견 대표 ID나 이름이 포함된 청크는 실패시킨다", async () => {
    const chunks = await chunksDirectory();
    await writeFile(
      join(chunks, "leaking.js"),
      "const recipe={id:'potato_stew',name:'감자 양파 스튜'};\n",
    );

    const result = await scanClientCookingSecrets(chunks);

    expect(result.leaks).toHaveLength(1);
    expect(result.leaks[0].file).toContain("leaking.js");
    expect(result.leaks[0].matches).toContain("potato_stew");
  });
});
