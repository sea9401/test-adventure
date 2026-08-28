import { readFile, readdir, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SENTINELS = [
  "potato_stew",
  "감자 양파 스튜",
  "tomato_salad",
  "불향 토마토 샐러드",
];

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(path);
    return entry.isFile() && /\.(?:js|mjs)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

export async function scanClientCookingSecrets(root) {
  const chunksRoot = resolve(root);
  if (!(await stat(chunksRoot)).isDirectory()) throw new Error("not_directory");
  const leaks = [];
  const files = await javascriptFiles(chunksRoot);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const matches = SENTINELS.filter((sentinel) => source.includes(sentinel));
    if (matches.length > 0) leaks.push({ file, matches });
  }
  return { chunksRoot, files, leaks };
}

async function main() {
  const chunksRoot = resolve(process.argv[2] ?? ".next/static/chunks");
  try {
    const result = await scanClientCookingSecrets(chunksRoot);
    const { leaks } = result;
    if (leaks.length > 0) {
      console.error("[check-client-cooking-secrets] 미발견 요리 정보가 클라이언트 청크에 포함됐습니다.");
      for (const leak of leaks) {
        console.error(`- ${relative(chunksRoot, leak.file)}: ${leak.matches.join(", ")}`);
      }
      process.exitCode = 1;
    } else {
      console.log("[check-client-cooking-secrets] 요리 비공개 정보 없음");
    }
  } catch (error) {
    console.error(`[check-client-cooking-secrets] 청크 검사 실패: ${chunksRoot}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  await main();
}
