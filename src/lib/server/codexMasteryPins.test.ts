import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCodexMasteryCatalog } from "@/adventure/data/v2/codexMasteryCatalog";

const mocks = vi.hoisted(() => ({
  lock: vi.fn(async () => ({})),
  upsert: vi.fn(async () => {}),
}));

vi.mock("@/lib/server/savesKv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/savesKv")>()),
  lockSaveForUpdate: mocks.lock,
  upsertSave: mocks.upsert,
}));

import {
  CODEX_MASTERY_PINS_KEY,
  parseCodexMasteryPins,
  validateCodexMasteryPinRequest,
  writeCodexMasteryPins,
} from "./codexMasteryPins";

const catalog = createCodexMasteryCatalog([
  {
    category: "fish",
    entryId: "carp",
    label: "잉어",
    thresholds: {
      bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 5, legendary: 6,
    },
    scoreWeightMilli: 1_000,
    seals: {},
  },
  {
    category: "job",
    entryId: "warrior",
    label: "전사",
    thresholds: {
      bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 5, legendary: 6,
    },
    scoreWeightMilli: 1_000,
    seals: {},
  },
]);

const carp = { category: "fish", entryId: "carp" } as const;
const warrior = { category: "job", entryId: "warrior" } as const;

describe("codex mastery tracked goals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tolerantly reads only unique current catalog entries up to five", () => {
    expect(parseCodexMasteryPins({
      entries: [
        carp,
        carp,
        { category: "fish", entryId: "removed" },
        { category: "bogus", entryId: "carp" },
        warrior,
        null,
      ],
    }, catalog)).toEqual([carp, warrior]);
    expect(parseCodexMasteryPins({ entries: "bad" }, catalog)).toEqual([]);
  });

  it.each([
    ["non-array", null],
    ["too many", [carp, warrior, carp, warrior, carp, warrior]],
    ["duplicate", [carp, carp]],
    ["unknown entry", [{ category: "fish", entryId: "removed" }]],
    ["unknown category", [{ category: "bogus", entryId: "carp" }]],
    ["empty id", [{ category: "fish", entryId: "" }]],
  ])("rejects strict %s pin input", (_label, entries) => {
    expect(validateCodexMasteryPinRequest(entries, catalog)).toMatchObject({
      ok: false,
    });
  });

  it("rejects inherited pin fields and accepts an empty list", () => {
    const inherited = Object.create(carp) as Record<string, unknown>;
    expect(validateCodexMasteryPinRequest([inherited], catalog)).toMatchObject({
      ok: false,
    });
    expect(validateCodexMasteryPinRequest([], catalog)).toEqual({
      ok: true,
      entries: [],
    });
  });

  it("locks and replaces only the small pin preference save", async () => {
    const tx = { marker: "tx" } as never;
    await expect(writeCodexMasteryPins(tx, "user-1", [carp, warrior]))
      .resolves.toEqual([carp, warrior]);

    expect(mocks.lock).toHaveBeenCalledWith(
      tx,
      "user-1",
      CODEX_MASTERY_PINS_KEY,
      { entries: [] },
    );
    expect(mocks.upsert).toHaveBeenCalledWith(
      tx,
      "user-1",
      CODEX_MASTERY_PINS_KEY,
      { entries: [carp, warrior] },
    );
  });
});
