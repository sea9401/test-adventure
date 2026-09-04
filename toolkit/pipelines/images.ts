import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, posix, relative, resolve } from "node:path";

import sharp from "sharp";

import type { AdapterContext } from "../core/adapter";
import type { ArtifactPlan } from "../core/artifacts";

export const IMAGE_ROLES = [
  "boss",
  "drop-30",
  "drop-10",
  "drop-rare",
] as const;

export type ImageRole = (typeof IMAGE_ROLES)[number];

export type ImageImportSpec = {
  role: ImageRole;
  target: string;
  requiresAlpha: boolean;
  rightsSource: string;
};

export type ImageInspection = {
  role: ImageRole;
  sourceName: string;
  target: string;
  importTarget: string;
  format: "png" | "webp";
  width: number;
  height: number;
  hasAlpha: boolean;
  byteLength: number;
  contentHash: string;
  bytes: Uint8Array;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function assertSafeTarget(projectRoot: string, target: string): void {
  if (
    target.includes("\\") ||
    isAbsolute(target) ||
    target !== posix.normalize(target) ||
    target.startsWith("../") ||
    !target.startsWith("public/images/") ||
    !target.endsWith(".webp") ||
    !isInside(resolve(projectRoot), resolve(projectRoot, target))
  ) {
    throw new Error(`unsafe image target: ${target}`);
  }
}

function validatedSpecs(
  context: AdapterContext,
  specs: readonly ImageImportSpec[],
): ReadonlyMap<ImageRole, ImageImportSpec> {
  const byRole = new Map<ImageRole, ImageImportSpec>();
  for (const spec of specs) {
    if (!IMAGE_ROLES.includes(spec.role)) {
      throw new Error(`unknown image role: ${String(spec.role)}`);
    }
    if (byRole.has(spec.role)) {
      throw new Error(`duplicate image spec for role ${spec.role}`);
    }
    assertSafeTarget(context.projectRoot, spec.target);
    byRole.set(spec.role, spec);
  }
  for (const role of IMAGE_ROLES) {
    if (!byRole.has(role)) {
      throw new Error(`missing image spec for role ${role}`);
    }
  }
  if (byRole.size !== IMAGE_ROLES.length) {
    throw new Error("image specs must contain exactly four roles");
  }
  return byRole;
}

function importTarget(target: string, format: "png" | "webp"): string {
  return format === "png" ? target.replace(/\.webp$/, ".png") : target;
}

export async function inspectImageInputs(
  context: AdapterContext,
  specs: readonly ImageImportSpec[],
  sourceDir: string,
): Promise<readonly ImageInspection[]> {
  if (sourceDir.includes("://")) {
    throw new Error("image source must be a local filesystem path");
  }
  const sourceStat = await lstat(sourceDir);
  if (sourceStat.isSymbolicLink() || !sourceStat.isDirectory()) {
    throw new Error("image source must be a regular directory, not a symlink");
  }
  const canonicalSource = await realpath(sourceDir);
  const byRole = validatedSpecs(context, specs);
  const entries = await readdir(canonicalSource, { withFileTypes: true });
  const expectedNames = new Set(
    IMAGE_ROLES.flatMap((role) => [`${role}.png`, `${role}.webp`]),
  );
  for (const entry of entries) {
    if (!expectedNames.has(entry.name)) {
      throw new Error(`undeclared image input: ${entry.name}`);
    }
  }

  const inspections: ImageInspection[] = [];
  for (const role of IMAGE_ROLES) {
    const matches = entries.filter(
      (entry) => entry.name === `${role}.png` || entry.name === `${role}.webp`,
    );
    if (matches.length === 0) {
      throw new Error(`missing image input for role ${role}`);
    }
    if (matches.length > 1) {
      throw new Error(`duplicate image input for role ${role}`);
    }
    const entry = matches[0];
    const sourcePath = resolve(canonicalSource, entry.name);
    const stat = await lstat(sourcePath);
    if (stat.isSymbolicLink()) {
      throw new Error(`image input cannot be a symlink: ${entry.name}`);
    }
    if (!stat.isFile()) {
      throw new Error(`image input must be a regular file: ${entry.name}`);
    }
    const bytes = await readFile(sourcePath);
    if (bytes.byteLength === 0) {
      throw new Error(`image input is empty: ${entry.name}`);
    }
    const metadata = await sharp(bytes, { animated: true }).metadata();
    if ((metadata.pages ?? 1) > 1) {
      throw new Error(`animated image input is not supported: ${entry.name}`);
    }
    const format = entry.name.endsWith(".png") ? "png" : "webp";
    if (metadata.format !== format) {
      throw new Error(`image format does not match extension: ${entry.name}`);
    }
    if (
      metadata.width === undefined ||
      metadata.height === undefined ||
      metadata.width <= 0 ||
      metadata.height <= 0
    ) {
      throw new Error(`image dimensions are unavailable: ${entry.name}`);
    }
    if (metadata.width > 4096 || metadata.height > 4096) {
      throw new Error(`image dimensions exceed 4096x4096: ${entry.name}`);
    }
    const spec = byRole.get(role)!;
    if (spec.requiresAlpha && metadata.hasAlpha !== true) {
      throw new Error(`image input requires alpha: ${entry.name}`);
    }
    inspections.push({
      role,
      sourceName: entry.name,
      target: spec.target,
      importTarget: importTarget(spec.target, format),
      format,
      width: metadata.width,
      height: metadata.height,
      hasAlpha: metadata.hasAlpha === true,
      byteLength: bytes.byteLength,
      contentHash: sha256(bytes),
      bytes,
    });
  }
  return inspections;
}

export async function planImageImport(
  context: AdapterContext,
  specs: readonly ImageImportSpec[],
  sourceDir: string,
): Promise<readonly ArtifactPlan[]> {
  const inspections = await inspectImageInputs(context, specs, sourceDir);
  return planInspectedImageImport(inspections);
}

export function planInspectedImageImport(
  inspections: readonly ImageInspection[],
): readonly ArtifactPlan[] {
  return inspections
    .map(
      (inspection): ArtifactPlan => ({
        scope: "project",
        path: inspection.importTarget,
        operation: "create",
        content: inspection.bytes,
      }),
    )
    .toSorted((left, right) => left.path.localeCompare(right.path));
}
