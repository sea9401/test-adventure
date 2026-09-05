import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

const directory = path.resolve("src/adventure/v2/combat");

it("keeps combat runtime dependencies acyclic after type-only imports are erased", () => {
  const graph = new Map<string, string[]>();
  for (const name of readdirSync(directory)) {
    if (!name.endsWith(".ts") || name.includes(".test.")) continue;
    const file = path.join(directory, name);
    const javascript = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
    }).outputText;
    const ast = ts.createSourceFile(file, javascript, ts.ScriptTarget.Latest, true);
    const dependencies: string[] = [];
    for (const statement of ast.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      const specifier = statement.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier)) continue;
      const target = specifier.text.startsWith("@/")
        ? path.resolve("src", specifier.text.slice(2))
        : path.resolve(directory, specifier.text);
      if (path.dirname(target) === directory) dependencies.push(`${target}.ts`);
    }
    graph.set(file, dependencies);
  }

  const visited = new Set<string>();
  function visit(file: string, ancestors: string[]) {
    expect(ancestors.includes(file), ancestors.concat(file).map((p) => path.basename(p)).join(" → ")).toBe(false);
    if (visited.has(file)) return;
    for (const dependency of graph.get(file) ?? []) visit(dependency, [...ancestors, file]);
    visited.add(file);
  }
  for (const file of graph.keys()) visit(file, []);
});
