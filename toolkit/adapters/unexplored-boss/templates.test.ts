import { beforeAll, describe, expect, it } from "vitest";

import { loadYamlSpec } from "../../core/specFile";
import { parseUnexploredBossSpec, type UnexploredBossSpecV1 } from "./schema";
import {
  renderAchievement,
  renderBossAchievementMapping,
  renderBossDefinition,
  renderEquipmentEntries,
  renderSummonMaterial,
  renderTitle,
} from "./templates";
import {
  insertArrayElement,
  insertObjectProperty,
} from "./typescriptEditor";

let spec: UnexploredBossSpecV1;

beforeAll(async () => {
  spec = parseUnexploredBossSpec(
    await loadYamlSpec(
      new URL(
        "../../testing/fixtures/specs/unexplored-boss.yaml",
        import.meta.url,
      ).pathname,
    ),
  );
});

describe("unexplored boss templates", () => {
  it("renders the fixed drop order and image paths", () => {
    const rendered = renderBossDefinition(spec);
    expect(rendered).toContain("echo_warden: {");
    expect(rendered.indexOf("chancePct: 30")).toBeLessThan(
      rendered.indexOf("chancePct: 10"),
    );
    expect(rendered.indexOf("chancePct: 10")).toBeLessThan(
      rendered.indexOf("chancePct: 0.5"),
    );
    expect(rendered).toContain(
      'image: "/images/monster/v2/unexplored-boss-echo-warden.webp"',
    );
  });

  it("renders equipment options in a stable semantic order", () => {
    const [first] = renderEquipmentEntries(spec);
    expect(first.indexOf("crit: 12")).toBeLessThan(first.indexOf("accuracy: 20"));
    expect(first.indexOf("accuracy: 20")).toBeLessThan(first.indexOf("spd: 18"));
    expect(first).toContain('image: "/images/equipment/unexplored-echo-blade.webp"');
    expect(first).toContain('rarity: "unique"');
    expect(first).toContain("noDrop: true");
  });

  it("quotes every copy value and produces one syntax-safe registry member", () => {
    expect(() =>
      insertObjectProperty("const MATERIALS = {\n};\n", {
        fileName: "materials.ts",
        declarationName: "MATERIALS",
        propertyName: spec.summon.materialId,
        renderedProperty: renderSummonMaterial(spec),
      }),
    ).not.toThrow();
    expect(() =>
      insertObjectProperty("const TITLES = {\n};\n", {
        fileName: "titles.ts",
        declarationName: "TITLES",
        propertyName: spec.title.id,
        renderedProperty: renderTitle(spec),
      }),
    ).not.toThrow();
    expect(() =>
      insertObjectProperty("const MAP = {\n};\n", {
        fileName: "progression.ts",
        declarationName: "MAP",
        propertyName: spec.id,
        renderedProperty: renderBossAchievementMapping(spec),
      }),
    ).not.toThrow();
    expect(() =>
      insertArrayElement("const ACHIEVEMENTS = [\n];\n", {
        fileName: "progression.ts",
        declarationName: "ACHIEVEMENTS",
        elementId: spec.achievement.id,
        renderedElement: renderAchievement(spec),
      }),
    ).not.toThrow();
  });

  it("escapes hostile-looking copy as a string instead of source", () => {
    const hostile = structuredClone(spec);
    hostile.title.description = '설명" }; const escaped = true; // 한글';
    const rendered = renderTitle(hostile);
    expect(rendered).toContain('설명\\" }; const escaped = true; // 한글');
    expect(rendered.match(/const escaped/g)).toHaveLength(1);
    expect(
      insertObjectProperty("const TITLES = {\n};\n", {
        fileName: "titles.ts",
        declarationName: "TITLES",
        propertyName: hostile.title.id,
        renderedProperty: rendered,
      }),
    ).not.toContain("const escaped = true;\n");
  });
});
