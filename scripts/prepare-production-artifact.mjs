#!/usr/bin/env node

import {
  lstat,
  opendir,
  open,
  readlink,
  realpath,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import process from "node:process";

const buildDirectory = resolve(process.argv[2] ?? ".next");
const deploySha = process.argv[3] ?? process.env.DEPLOY_SHA ?? "";
const projectDirectory = process.cwd();
const runtimeModulesDirectory = resolve(projectDirectory, "node_modules");
const ignoredDirectories = new Set(["cache", "dev"]);

if (!/^[0-9a-f]{40}$/.test(deploySha)) {
  throw new Error("deploy SHA must be a full lowercase 40-character commit SHA");
}

const requiredPaths = [
  "BUILD_ID",
  "required-server-files.json",
  "server",
  "static",
];

for (const requiredPath of requiredPaths) {
  await lstat(join(buildDirectory, requiredPath));
}

function isNativeBinary(header, extension) {
  if (extension === ".node") return true;
  if (header.length >= 4 && header[0] === 0x7f && header[1] === 0x45) {
    return header[2] === 0x4c && header[3] === 0x46; // ELF
  }
  if (header.length >= 4) {
    const magic = header.readUInt32BE(0);
    return new Set([
      0xcafebabe, // universal Mach-O
      0xfeedface,
      0xfeedfacf,
      0xcefaedfe,
      0xcffaedfe,
    ]).has(magic);
  }
  return false;
}

async function inspect(directory) {
  const entries = await opendir(directory);
  for await (const entry of entries) {
    if (directory === buildDirectory && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const path = join(directory, entry.name);
    const displayPath = relative(projectDirectory, path);
    const stats = await lstat(path);

    if (stats.isDirectory()) {
      await inspect(path);
      continue;
    }

    if (stats.isSymbolicLink()) {
      const target = await readlink(path);
      if (target.startsWith("/")) {
        throw new Error(`absolute symlink is not portable: ${displayPath}`);
      }
      const resolvedTarget = resolve(dirname(path), target);
      if (
        resolvedTarget !== runtimeModulesDirectory &&
        !resolvedTarget.startsWith(`${runtimeModulesDirectory}${sep}`)
      ) {
        throw new Error(
          `symlink must resolve into runtime node_modules: ${displayPath} -> ${target}`,
        );
      }
      continue;
    }

    if (!stats.isFile()) {
      throw new Error(`unsupported build artifact entry: ${displayPath}`);
    }

    const handle = await open(path, "r");
    try {
      const header = Buffer.alloc(4);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      if (isNativeBinary(header.subarray(0, bytesRead), extname(path))) {
        throw new Error(
          `native binary cannot cross x64 CI to ARM64 production: ${displayPath}`,
        );
      }
    } finally {
      await handle.close();
    }
  }
}

await realpath(buildDirectory);
await inspect(buildDirectory);

await writeFile(join(buildDirectory, "DEPLOY_SHA"), `${deploySha}\n`, {
  mode: 0o644,
});
await writeFile(
  join(buildDirectory, "DEPLOY_ARTIFACT.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      deploySha,
      builder: {
        platform: process.platform,
        arch: process.arch,
        node: process.version,
      },
      nativeBinariesIncluded: false,
      runtimeDependencies: "external-node_modules",
    },
    null,
    2,
  )}\n`,
  { mode: 0o644 },
);

console.log(`production artifact prepared for ${deploySha}`);
