import ts from "typescript";

export type ObjectPropertyInsertion = {
  fileName: string;
  declarationName: string;
  propertyName: string;
  renderedProperty: string;
};

export type ArrayElementInsertion = {
  fileName: string;
  declarationName: string;
  elementId: string;
  identityProperty?: string;
  renderedElement: string;
};

type ParsedSource = {
  sourceFile: ts.SourceFile;
  newline: "\n" | "\r\n";
};

function newlineOf(source: string, fileName: string): "\n" | "\r\n" {
  const hasCrLf = source.includes("\r\n");
  const hasBareLf = source.replaceAll("\r\n", "").includes("\n");
  if (hasCrLf && hasBareLf) {
    throw new Error(`${fileName} mixes LF and CRLF newlines`);
  }
  return hasCrLf ? "\r\n" : "\n";
}

function parseSource(fileName: string, source: string): ParsedSource {
  const newline = newlineOf(source, fileName);
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const diagnostics = (
    sourceFile as ts.SourceFile & {
      parseDiagnostics?: readonly ts.Diagnostic[];
    }
  ).parseDiagnostics;
  if (diagnostics !== undefined && diagnostics.length > 0) {
    throw new Error(`${fileName} has TypeScript parse diagnostics`);
  }
  return { sourceFile, newline };
}

function namedDeclarations(
  sourceFile: ts.SourceFile,
  declarationName: string,
): readonly ts.VariableDeclaration[] {
  const matches: ts.VariableDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === declarationName
    ) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one declaration named ${declarationName}, found ${matches.length}`,
    );
  }
  return matches;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function requireInitializer(
  sourceFile: ts.SourceFile,
  declarationName: string,
): ts.Expression {
  const declaration = namedDeclarations(sourceFile, declarationName)[0];
  if (declaration.initializer === undefined) {
    throw new Error(`${declarationName} has no initializer`);
  }
  return unwrapExpression(declaration.initializer);
}

function propertyName(
  member: ts.ObjectLiteralElementLike,
  declarationName: string,
): string {
  if (ts.isSpreadAssignment(member)) {
    throw new Error(`${declarationName} contains a spread property`);
  }
  const name = member.name;
  if (name === undefined || ts.isComputedPropertyName(name)) {
    throw new Error(`${declarationName} contains a computed property`);
  }
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }
  throw new Error(`${declarationName} contains an unsupported property name`);
}

function requireObjectLiteral(
  sourceFile: ts.SourceFile,
  declarationName: string,
): ts.ObjectLiteralExpression {
  const initializer = requireInitializer(sourceFile, declarationName);
  if (!ts.isObjectLiteralExpression(initializer)) {
    throw new Error(`${declarationName} must be initialized with an object literal`);
  }
  for (const member of initializer.properties) {
    propertyName(member, declarationName);
  }
  return initializer;
}

function requireArrayLiteral(
  sourceFile: ts.SourceFile,
  declarationName: string,
): ts.ArrayLiteralExpression {
  const initializer = requireInitializer(sourceFile, declarationName);
  if (!ts.isArrayLiteralExpression(initializer)) {
    throw new Error(`${declarationName} must be initialized with an array literal`);
  }
  for (const element of initializer.elements) {
    if (ts.isSpreadElement(element)) {
      throw new Error(`${declarationName} contains a spread element`);
    }
  }
  return initializer;
}

function lineIndent(source: string, position: number): string {
  const lineStart = source.lastIndexOf("\n", position - 1) + 1;
  const prefix = source.slice(lineStart, position);
  const match = prefix.match(/^\s*/);
  return match?.[0].replaceAll("\r", "") ?? "";
}

function closingInsertionPosition(
  source: string,
  closingPosition: number,
): number {
  const lineStart = source.lastIndexOf("\n", closingPosition - 1) + 1;
  return /^\s*$/.test(source.slice(lineStart, closingPosition))
    ? lineStart
    : closingPosition;
}

function assertRenderedNewline(
  rendered: string,
  newline: "\n" | "\r\n",
  label: string,
): void {
  if (!rendered.endsWith(newline)) {
    throw new Error(`${label} must end with the source newline`);
  }
  if (newline === "\r\n" && rendered.replaceAll("\r\n", "").includes("\n")) {
    throw new Error(`${label} must use CRLF newlines`);
  }
  if (newline === "\n" && rendered.includes("\r\n")) {
    throw new Error(`${label} must use LF newlines`);
  }
}

function expectedIndent(
  source: string,
  sourceFile: ts.SourceFile,
  literal: ts.ObjectLiteralExpression | ts.ArrayLiteralExpression,
): string {
  const members = ts.isObjectLiteralExpression(literal)
    ? literal.properties
    : literal.elements;
  if (members.length > 0) {
    return lineIndent(source, members[0].getStart(sourceFile));
  }
  const closing = literal.getEnd() - 1;
  return `${lineIndent(source, closing)}  `;
}

function assertIndent(rendered: string, indent: string, label: string): void {
  if (!rendered.startsWith(indent) || rendered.trimStart() === rendered) {
    throw new Error(`${label} must use the declaration member indentation`);
  }
}

function propertyNameFromAssignment(
  member: ts.ObjectLiteralElementLike,
): string | null {
  if (!ts.isPropertyAssignment(member)) {
    return null;
  }
  if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) {
    return member.name.text;
  }
  return null;
}

function validateRenderedProperty(
  rendered: string,
  newline: "\n" | "\r\n",
  requestedName: string,
): void {
  const wrapper = `const __TOOLKIT__ = {${newline}${rendered}};${newline}`;
  try {
    const parsed = parseSource("toolkit-rendered-property.ts", wrapper);
    const literal = requireObjectLiteral(parsed.sourceFile, "__TOOLKIT__");
    if (
      literal.properties.length !== 1 ||
      propertyNameFromAssignment(literal.properties[0]) !== requestedName
    ) {
      throw new Error("invalid member");
    }
  } catch {
    throw new Error("rendered property must contain exactly one object member");
  }
}

function objectIdentity(
  element: ts.Expression,
  identityProperty: string,
): string | null {
  const unwrapped = unwrapExpression(element);
  if (!ts.isObjectLiteralExpression(unwrapped)) {
    return null;
  }
  for (const member of unwrapped.properties) {
    if (
      ts.isPropertyAssignment(member) &&
      propertyNameFromAssignment(member) === identityProperty &&
      ts.isStringLiteralLike(member.initializer)
    ) {
      return member.initializer.text;
    }
  }
  return null;
}

function validateRenderedElement(
  rendered: string,
  newline: "\n" | "\r\n",
  identityProperty: string,
  elementId: string,
): void {
  const wrapper = `const __TOOLKIT__ = [${newline}${rendered}];${newline}`;
  try {
    const parsed = parseSource("toolkit-rendered-element.ts", wrapper);
    const literal = requireArrayLiteral(parsed.sourceFile, "__TOOLKIT__");
    if (
      literal.elements.length !== 1 ||
      objectIdentity(literal.elements[0], identityProperty) !== elementId
    ) {
      throw new Error("invalid element");
    }
  } catch {
    throw new Error("rendered element must contain exactly one array element");
  }
}

function insertAtLiteralEnd(
  source: string,
  sourceFile: ts.SourceFile,
  literal: ts.ObjectLiteralExpression | ts.ArrayLiteralExpression,
  rendered: string,
  newline: "\n" | "\r\n",
): string {
  const members = ts.isObjectLiteralExpression(literal)
    ? literal.properties
    : literal.elements;
  const closingPosition = literal.getEnd() - 1;
  const insertionPosition = closingInsertionPosition(source, closingPosition);
  let prefix = source.slice(0, insertionPosition);
  if (members.length === 0) {
    if (!prefix.endsWith(newline)) {
      prefix += newline;
    }
  } else {
    const last = members[members.length - 1];
    const gap = source.slice(last.getEnd(), insertionPosition);
    if (!/^\s*,/.test(gap)) {
      prefix = `${source.slice(0, last.getEnd())},${source.slice(
        last.getEnd(),
        insertionPosition,
      )}`;
    }
    if (!gap.includes("\n")) {
      prefix += newline;
    }
  }
  return `${prefix}${rendered}${source.slice(insertionPosition)}`;
}

export function readObjectPropertyNames(
  source: string,
  declarationName: string,
  fileName = "source.ts",
): readonly string[] {
  const parsed = parseSource(fileName, source);
  const literal = requireObjectLiteral(parsed.sourceFile, declarationName);
  return literal.properties.map((member) =>
    propertyName(member, declarationName),
  );
}

export function readStringArrayElements(
  source: string,
  declarationName: string,
  fileName = "source.ts",
): readonly string[] {
  const parsed = parseSource(fileName, source);
  const literal = requireArrayLiteral(parsed.sourceFile, declarationName);
  return literal.elements.map((element) => {
    if (!ts.isStringLiteralLike(element)) {
      throw new Error(`${declarationName} must contain only string literals`);
    }
    return element.text;
  });
}

export function insertObjectProperty(
  source: string,
  request: ObjectPropertyInsertion,
): string {
  const parsed = parseSource(request.fileName, source);
  const literal = requireObjectLiteral(
    parsed.sourceFile,
    request.declarationName,
  );
  const names = literal.properties.map((member) =>
    propertyName(member, request.declarationName),
  );
  if (names.includes(request.propertyName)) {
    throw new Error(
      `${request.declarationName} already contains ${request.propertyName}`,
    );
  }
  assertRenderedNewline(
    request.renderedProperty,
    parsed.newline,
    "rendered property",
  );
  assertIndent(
    request.renderedProperty,
    expectedIndent(source, parsed.sourceFile, literal),
    "rendered property",
  );
  validateRenderedProperty(
    request.renderedProperty,
    parsed.newline,
    request.propertyName,
  );
  return insertAtLiteralEnd(
    source,
    parsed.sourceFile,
    literal,
    request.renderedProperty,
    parsed.newline,
  );
}

export function insertArrayElement(
  source: string,
  request: ArrayElementInsertion,
): string {
  const parsed = parseSource(request.fileName, source);
  const literal = requireArrayLiteral(
    parsed.sourceFile,
    request.declarationName,
  );
  const identityProperty = request.identityProperty ?? "id";
  const identities = literal.elements.map((element) =>
    objectIdentity(element, identityProperty),
  );
  if (identities.includes(request.elementId)) {
    throw new Error(
      `${request.declarationName} already contains ${identityProperty} ${request.elementId}`,
    );
  }
  assertRenderedNewline(
    request.renderedElement,
    parsed.newline,
    "rendered element",
  );
  assertIndent(
    request.renderedElement,
    expectedIndent(source, parsed.sourceFile, literal),
    "rendered element",
  );
  validateRenderedElement(
    request.renderedElement,
    parsed.newline,
    identityProperty,
    request.elementId,
  );
  return insertAtLiteralEnd(
    source,
    parsed.sourceFile,
    literal,
    request.renderedElement,
    parsed.newline,
  );
}
