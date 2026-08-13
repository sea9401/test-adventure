#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function findUnpinnedActions(source, fileName) {
  const errors = [];
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (line.trimStart().startsWith("#")) continue;
    const reference = line.match(/\buses:\s*([^\s#]+)/)?.[1];
    if (!reference || reference.startsWith("./") || reference.startsWith("docker://")) {
      continue;
    }
    const separator = reference.lastIndexOf("@");
    const revision = separator >= 0 ? reference.slice(separator + 1) : "";
    if (!/^[0-9a-f]{40}$/i.test(revision)) {
      errors.push(`${fileName}:${index + 1} ${reference}`);
    }
  }
  return errors;
}

async function main() {
  const workflowDirectory = resolve(".github/workflows");
  const workflowFiles = (await readdir(workflowDirectory))
    .filter((fileName) => /\.ya?ml$/i.test(fileName))
    .sort();
  const errors = [];
  for (const fileName of workflowFiles) {
    const path = resolve(workflowDirectory, fileName);
    errors.push(
      ...findUnpinnedActions(
        await readFile(path, "utf8"),
        `.github/workflows/${fileName}`,
      ),
    );
  }
  if (errors.length > 0) {
    console.error("✗ GitHub Actions references must use full commit SHAs");
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ workflow action references pinned (${workflowFiles.length} files)`);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
