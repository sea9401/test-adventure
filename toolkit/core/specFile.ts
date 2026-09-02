import { readFile } from "node:fs/promises";

import { isScalar, parseDocument, visit } from "yaml";

function inspectDocument(document: ReturnType<typeof parseDocument>): void {
  visit(document, {
    Pair(_key, pair) {
      if (isScalar(pair.key) && pair.key.value === "<<") {
        throw new Error("YAML merge keys are not allowed");
      }
    },
    Alias() {
      throw new Error("YAML aliases are not allowed");
    },
    Node(_key, node) {
      if (
        node.tag !== undefined &&
        !node.tag.startsWith("tag:yaml.org,2002:")
      ) {
        throw new Error("YAML custom tags are not allowed");
      }
    },
  });
}

export async function loadYamlSpec(path: string): Promise<unknown> {
  const source = await readFile(path, "utf8");
  const document = parseDocument(source, {
    merge: false,
    prettyErrors: true,
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    throw document.errors[0];
  }
  inspectDocument(document);
  if (document.warnings.length > 0) {
    throw new Error(`YAML warning: ${document.warnings[0].message}`);
  }
  return document.toJS({ maxAliasCount: 0 });
}
