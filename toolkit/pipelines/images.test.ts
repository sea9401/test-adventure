import { mkdir, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { AdapterContext } from "../core/adapter";
import type { ImageSpec } from "../adapters/unexplored-boss/schema";
import { createFixtureWorkspace } from "../testing/fixtureWorkspace";
import { inspectImageInputs, planImageImport } from "./images";

const cleanups: Array<() => Promise<void>> = [];
let opaquePng: Buffer;
let alphaPng: Buffer;
let opaqueWebp: Buffer;

beforeAll(async () => {
  opaquePng = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: { r: 12, g: 34, b: 56 },
    },
  })
    .png()
    .toBuffer();
  alphaPng = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 12, g: 34, b: 56, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  opaqueWebp = await sharp(opaquePng).webp().toBuffer();
});

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

function imageSpecs(): readonly ImageSpec[] {
  return [
    {
      role: "boss",
      target: "public/images/monster/v2/unexplored-boss-echo-warden.webp",
      requiresAlpha: false,
      rightsSource: "operator-cleared-game-art",
    },
    {
      role: "drop-30",
      target: "public/images/equipment/unexplored-echo-blade.webp",
      requiresAlpha: true,
      rightsSource: "operator-cleared-game-art",
    },
    {
      role: "drop-10",
      target: "public/images/equipment/unexplored-echo-gloves.webp",
      requiresAlpha: true,
      rightsSource: "operator-cleared-game-art",
    },
    {
      role: "drop-rare",
      target: "public/images/equipment/unexplored-echo-core.webp",
      requiresAlpha: true,
      rightsSource: "operator-cleared-game-art",
    },
  ];
}

async function setup() {
  const fixture = await createFixtureWorkspace();
  cleanups.push(fixture.cleanup);
  const sourceDir = join(fixture.root, "inputs");
  await mkdir(sourceDir);
  await Promise.all([
    writeFile(join(sourceDir, "boss.png"), opaquePng),
    writeFile(join(sourceDir, "drop-30.png"), alphaPng),
    writeFile(join(sourceDir, "drop-10.webp"), await sharp(alphaPng).webp().toBuffer()),
    writeFile(join(sourceDir, "drop-rare.png"), alphaPng),
  ]);
  const context: AdapterContext = {
    projectRoot: fixture.root,
    taskId: "boss-echo-warden",
    taskRoot: join(fixture.root, ".toolkit/work/boss-echo-warden"),
    baseSha: "a".repeat(40),
  };
  return { fixture, sourceDir, context };
}

describe("image import planning", () => {
  it("maps each supplied image by declared role rather than discovery order", async () => {
    const { context, sourceDir } = await setup();

    const plans = await planImageImport(context, imageSpecs(), sourceDir);

    expect(plans.map((plan) => plan.path)).toEqual([
      "public/images/equipment/unexplored-echo-blade.png",
      "public/images/equipment/unexplored-echo-core.png",
      "public/images/equipment/unexplored-echo-gloves.webp",
      "public/images/monster/v2/unexplored-boss-echo-warden.png",
    ]);
    expect(plans.every((plan) => plan.operation === "create")).toBe(true);
  });

  it("returns decoded metadata and stable content hashes", async () => {
    const { context, sourceDir } = await setup();

    const inspected = await inspectImageInputs(context, imageSpecs(), sourceDir);

    expect(inspected).toHaveLength(4);
    expect(inspected.find((image) => image.role === "boss")).toMatchObject({
      format: "png",
      width: 8,
      height: 8,
      hasAlpha: false,
    });
    expect(inspected.every((image) => /^[a-f0-9]{64}$/.test(image.contentHash))).toBe(
      true,
    );
  });

  it("rejects undeclared, duplicate, symlinked, and empty source files", async () => {
    const extra = await setup();
    await writeFile(join(extra.sourceDir, "extra.png"), opaquePng);
    await expect(
      planImageImport(extra.context, imageSpecs(), extra.sourceDir),
    ).rejects.toThrow("undeclared image input: extra.png");

    const duplicate = await setup();
    await writeFile(join(duplicate.sourceDir, "boss.webp"), opaqueWebp);
    await expect(
      planImageImport(duplicate.context, imageSpecs(), duplicate.sourceDir),
    ).rejects.toThrow("duplicate image input for role boss");

    const symlinkFixture = await setup();
    const symlinkPath = join(symlinkFixture.sourceDir, "boss.png");
    await writeFile(join(symlinkFixture.fixture.root, "linked.png"), opaquePng);
    await unlink(symlinkPath);
    await symlink(join(symlinkFixture.fixture.root, "linked.png"), symlinkPath);
    await expect(
      planImageImport(symlinkFixture.context, imageSpecs(), symlinkFixture.sourceDir),
    ).rejects.toThrow("image input cannot be a symlink: boss.png");

    const empty = await setup();
    await writeFile(join(empty.sourceDir, "boss.png"), new Uint8Array());
    await expect(
      planImageImport(empty.context, imageSpecs(), empty.sourceDir),
    ).rejects.toThrow("image input is empty: boss.png");
  });

  it("rejects missing alpha, excessive dimensions, mismatched formats, and unsafe targets", async () => {
    const alpha = await setup();
    await writeFile(join(alpha.sourceDir, "drop-30.png"), opaquePng);
    await expect(
      planImageImport(alpha.context, imageSpecs(), alpha.sourceDir),
    ).rejects.toThrow("image input requires alpha: drop-30.png");

    const huge = await setup();
    const hugePng = await sharp({
      create: {
        width: 4097,
        height: 1,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();
    await writeFile(join(huge.sourceDir, "boss.png"), hugePng);
    await expect(
      planImageImport(huge.context, imageSpecs(), huge.sourceDir),
    ).rejects.toThrow("image dimensions exceed 4096x4096: boss.png");

    const mismatched = await setup();
    await writeFile(join(mismatched.sourceDir, "boss.png"), opaqueWebp);
    await expect(
      planImageImport(mismatched.context, imageSpecs(), mismatched.sourceDir),
    ).rejects.toThrow("image format does not match extension: boss.png");

    const animated = await setup();
    const redFrame = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();
    const blueFrame = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 0, g: 0, b: 255 },
      },
    })
      .png()
      .toBuffer();
    const animatedWebp = await sharp(
      [redFrame, blueFrame],
      { join: { animated: true } },
    )
      .webp({ delay: [100, 100], loop: 0 })
      .toBuffer();
    await unlink(join(animated.sourceDir, "boss.png"));
    await writeFile(join(animated.sourceDir, "boss.webp"), animatedWebp);
    await expect(
      planImageImport(animated.context, imageSpecs(), animated.sourceDir),
    ).rejects.toThrow("animated image input is not supported: boss.webp");

    const unsafe = imageSpecs().map((image) => ({ ...image }));
    unsafe[0].target = "../outside.webp";
    const paths = await setup();
    await expect(
      planImageImport(paths.context, unsafe, paths.sourceDir),
    ).rejects.toThrow("unsafe image target: ../outside.webp");
  });
});
