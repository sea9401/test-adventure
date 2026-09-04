import { describe, expect, it } from "vitest";

import {
  insertArrayElement,
  insertObjectProperty,
  readObjectPropertyNames,
  readStringArrayElements,
} from "./typescriptEditor";

describe("insertObjectProperty", () => {
  const source =
    'const CATALOG = {\n  old: { id: "old" },\n} as const;\nconst untouched = 1;\n';

  it("inserts before the named object closing brace and preserves unrelated bytes", () => {
    const output = insertObjectProperty(source, {
      fileName: "catalog.ts",
      declarationName: "CATALOG",
      propertyName: "new_id",
      renderedProperty: '  new_id: { id: "new_id" },\n',
    });

    expect(output).toContain('old: { id: "old" },\n  new_id:');
    expect(output.endsWith("const untouched = 1;\n")).toBe(true);
  });

  it("handles quoted names, CRLF, and as-const-satisfies wrappers", () => {
    const crlf =
      'const CATALOG = {\r\n  "old-id": 1,\r\n} as const satisfies Record<string, number>;\r\n';
    const output = insertObjectProperty(crlf, {
      fileName: "catalog.ts",
      declarationName: "CATALOG",
      propertyName: "new-id",
      renderedProperty: '  "new-id": 2,\r\n',
    });

    expect(output).toContain('"old-id": 1,\r\n  "new-id": 2,\r\n');
    expect(readObjectPropertyNames(output, "CATALOG", "catalog.ts")).toEqual([
      "old-id",
      "new-id",
    ]);
  });

  it("adds the separating comma when the previous member has none", () => {
    const noComma = 'const CATALOG = {\n  old: 1\n};\n';
    expect(
      insertObjectProperty(noComma, {
        fileName: "catalog.ts",
        declarationName: "CATALOG",
        propertyName: "next",
        renderedProperty: "  next: 2,\n",
      }),
    ).toContain("old: 1,\n  next: 2,");
  });

  it("rejects an existing property", () => {
    expect(() =>
      insertObjectProperty(source, {
        fileName: "catalog.ts",
        declarationName: "CATALOG",
        propertyName: "old",
        renderedProperty: "  old: { id: 2 },\n",
      }),
    ).toThrow("CATALOG already contains old");
  });

  it("preserves computed properties backed by string constants and detects their ids", () => {
    const computed = [
      'const STATIC_ID = "static_id";',
      "const CATALOG = {",
      "  [STATIC_ID]: { id: STATIC_ID },",
      "};",
      "",
    ].join("\n");

    expect(
      insertObjectProperty(computed, {
        fileName: "catalog.ts",
        declarationName: "CATALOG",
        propertyName: "next",
        renderedProperty: "  next: { id: \"next\" },\n",
      }),
    ).toContain("[STATIC_ID]: { id: STATIC_ID },\n  next:");
    expect(() =>
      insertObjectProperty(computed, {
        fileName: "catalog.ts",
        declarationName: "CATALOG",
        propertyName: "static_id",
        renderedProperty: '  static_id: { id: "static_id" },\n',
      }),
    ).toThrow("CATALOG already contains static_id");
  });

  it.each([
    [
      "duplicate declarations",
      "const CATALOG = {};\nconst CATALOG = {};\n",
      "expected exactly one declaration named CATALOG",
    ],
    [
      "parse diagnostics",
      "const CATALOG = { broken: };\n",
      "catalog.ts has TypeScript parse diagnostics",
    ],
    [
      "spread properties",
      "const CATALOG = { ...base };\n",
      "CATALOG contains a spread property",
    ],
    [
      "computed properties",
      "const CATALOG = { [key]: 1 };\n",
      "CATALOG contains a computed property",
    ],
    [
      "mixed newlines",
      "const CATALOG = {\r\n  old: 1,\n};\r\n",
      "catalog.ts mixes LF and CRLF newlines",
    ],
  ])("rejects %s", (_name, invalidSource, message) => {
    expect(() =>
      insertObjectProperty(invalidSource, {
        fileName: "catalog.ts",
        declarationName: "CATALOG",
        propertyName: "next",
        renderedProperty: "  next: 2,\n",
      }),
    ).toThrow(message);
  });

  it("rejects a snippet that escapes the requested property span", () => {
    expect(() =>
      insertObjectProperty(source, {
        fileName: "catalog.ts",
        declarationName: "CATALOG",
        propertyName: "next",
        renderedProperty: "  next: 2,\n};\nconst escaped = true;\n",
      }),
    ).toThrow("rendered property must contain exactly one object member");
  });
});

describe("insertArrayElement", () => {
  const source =
    'const ENTRIES = [\n  { id: "old", value: 1 },\n] as const;\nconst untouched = true;\n';

  it("inserts one identified element without rewriting the rest of the file", () => {
    const output = insertArrayElement(source, {
      fileName: "entries.ts",
      declarationName: "ENTRIES",
      elementId: "new",
      renderedElement: '  { id: "new", value: 2 },\n',
    });

    expect(output).toContain(
      '{ id: "old", value: 1 },\n  { id: "new", value: 2 },',
    );
    expect(output.endsWith("const untouched = true;\n")).toBe(true);
  });

  it("rejects an existing element identity and spread elements", () => {
    expect(() =>
      insertArrayElement(source, {
        fileName: "entries.ts",
        declarationName: "ENTRIES",
        elementId: "old",
        renderedElement: '  { id: "old", value: 2 },\n',
      }),
    ).toThrow("ENTRIES already contains id old");

    expect(() =>
      insertArrayElement("const ENTRIES = [...base];\n", {
        fileName: "entries.ts",
        declarationName: "ENTRIES",
        elementId: "new",
        renderedElement: '  { id: "new" },\n',
      }),
    ).toThrow("ENTRIES contains a spread element");
  });
});

describe("readStringArrayElements", () => {
  it("reads a named as-const string catalog", () => {
    expect(
      readStringArrayElements(
        'export const IDS = ["first", "second"] as const;\n',
        "IDS",
        "ids.ts",
      ),
    ).toEqual(["first", "second"]);
  });

  it("rejects non-string entries", () => {
    expect(() =>
      readStringArrayElements(
        'const IDS = ["first", getSecond()];\n',
        "IDS",
        "ids.ts",
      ),
    ).toThrow("IDS must contain only string literals");
  });
});
