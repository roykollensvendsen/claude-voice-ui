// How the source is put together, for the quality ratchet: the most tangled function in each
// module, and how many groups of modules import each other in a circle when they load.
//
//     node scripts/structure.ts src    # prints {"complexity": {...}, "cycles": n}

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

const folder = resolve(process.argv[2] ?? "src");

function modules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return modules(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

const FUNCTIONS = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.Constructor,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
]);
const DECISIONS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ConditionalExpression,
]);
const JOINS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

/** McCabe's count for one function, leaving out the functions defined inside it. */
function complexityOf(fn: ts.Node): number {
  let count = 1;
  const visit = (node: ts.Node) => {
    if (FUNCTIONS.has(node.kind)) return;
    if (DECISIONS.has(node.kind)) count += 1;
    else if (ts.isBinaryExpression(node) && JOINS.has(node.operatorToken.kind)) count += 1;
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn, visit);
  return count;
}

function parse(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
}

/** The modules `file` imports when it loads: not type-only imports, which vanish when compiled. */
function loads(file: ts.SourceFile, names: Map<string, string>): string[] {
  const found: string[] = [];
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
    if (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly) continue;
    if (ts.isExportDeclaration(statement) && statement.isTypeOnly) continue;
    const spec = statement.moduleSpecifier;
    if (!spec || !ts.isStringLiteral(spec) || !spec.text.startsWith(".")) continue;
    const target = resolve(file.fileName, "..", spec.text);
    const hit = names.get(target) ?? names.get(`${target}.ts`);
    if (hit) found.push(hit);
  }
  return found;
}

/** Tarjan's strongly connected components; a group of more than one module is a cycle. */
function cycles(graph: Map<string, string[]>): number {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  let groups = 0;
  const visit = (node: string) => {
    index.set(node, index.size);
    low.set(node, index.get(node) ?? 0);
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node) ?? 0, low.get(next) ?? 0));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node) ?? 0, index.get(next) ?? 0));
      }
    }
    if (low.get(node) === index.get(node)) {
      let size = 0;
      let top: string | undefined;
      do {
        top = stack.pop();
        if (top) onStack.delete(top);
        size += 1;
      } while (top !== node);
      if (size > 1) groups += 1;
    }
  };
  for (const node of [...graph.keys()].sort()) if (!index.has(node)) visit(node);
  return groups;
}

const paths = modules(folder).sort();
const names = new Map(paths.map((p) => [p, relative(folder, p).split("\\").join("/")]));
const complexity: Record<string, number> = {};
const graph = new Map<string, string[]>();
for (const path of paths) {
  const file = parse(path);
  const name = names.get(path) ?? path;
  const scores: number[] = [];
  const walk = (node: ts.Node) => {
    if (FUNCTIONS.has(node.kind)) scores.push(complexityOf(node));
    ts.forEachChild(node, walk);
  };
  walk(file);
  if (scores.length) complexity[name] = Math.max(...scores);
  graph.set(name, loads(file, names));
}
console.log(JSON.stringify({ complexity, cycles: cycles(graph) }));
