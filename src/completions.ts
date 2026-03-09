import path from 'path';
import type ts from 'typescript/lib/tsserverlibrary';
import { findCssModuleImportForBinding } from './css-module-imports';
import { UsageTracker } from './usage-tracker';

/**
 * Enhance completions with CSS module class names.
 * Adds class name suggestions when typing after a CSS module binding (e.g. styles.)
 */
export function getCssModuleCompletions(
  tsModule: typeof ts,
  fileName: string,
  position: number,
  program: ts.Program,
  tracker: UsageTracker
): ts.CompletionEntry[] | null {
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) return null;

  // Find which CSS module binding (if any) the cursor is accessing
  const binding = findCssModuleBindingAtPosition(tsModule, sourceFile, position, program);
  if (!binding) return null;

  const parsed = tracker.getStyleFile(binding.resolvedPath);
  if (!parsed) return null;

  const entries: ts.CompletionEntry[] = [];
  const basename = path.basename(binding.resolvedPath);

  for (const className of Object.keys(parsed.classes)) {
    entries.push({
      name: className,
      kind: tsModule.ScriptElementKind.memberVariableElement,
      sortText: '0',
      labelDetails: { description: basename },
    });
  }

  for (const propName of Object.keys(parsed.exportProps)) {
    entries.push({
      name: propName,
      kind: tsModule.ScriptElementKind.memberVariableElement,
      sortText: '1',
      labelDetails: { description: `:export (${basename})` },
    });
  }

  return entries;
}

interface CssModuleBinding {
  bindingName: string;
  resolvedPath: string;
}

function findCssModuleBindingAtPosition(
  tsModule: typeof ts,
  sourceFile: ts.SourceFile,
  position: number,
  program: ts.Program,
): CssModuleBinding | null {
  // Find the token at position
  const token = findTokenAtPosition(tsModule, sourceFile, position);
  if (!token) return null;

  // Check if we're in a property access like `styles.`
  const parent = token.parent;
  if (!parent) return null;

  let identifierName: string | null = null;

  if (tsModule.isPropertyAccessExpression(parent) && tsModule.isIdentifier(parent.expression)) {
    identifierName = parent.expression.text;
  } else if (tsModule.isIdentifier(token)) {
    // Could be right after the dot — check the previous token's parent
    const prevToken = findPreviousToken(tsModule, sourceFile, token.getStart(sourceFile));
    if (prevToken && prevToken.kind === tsModule.SyntaxKind.DotToken && prevToken.parent) {
      const parentExpr = prevToken.parent;
      if (tsModule.isPropertyAccessExpression(parentExpr) && tsModule.isIdentifier(parentExpr.expression)) {
        identifierName = parentExpr.expression.text;
      }
    }
  }

  if (!identifierName) return null;

  // Check if this identifier is a CSS module import
  const resolved = findCssModuleImportForBinding(tsModule, sourceFile, identifierName, program);
  return resolved ? { bindingName: identifierName, resolvedPath: resolved.resolvedPath } : null;
}

function findTokenAtPosition(tsModule: typeof ts, sourceFile: ts.SourceFile, position: number): ts.Node | undefined {
  function find(node: ts.Node): ts.Node | undefined {
    if (position >= node.getStart(sourceFile) && position < node.getEnd()) {
      return tsModule.forEachChild(node, find) || node;
    }
    return undefined;
  }
  return find(sourceFile);
}

function findPreviousToken(tsModule: typeof ts, sourceFile: ts.SourceFile, position: number): ts.Node | undefined {
  let previous: ts.Node | undefined;

  function visit(node: ts.Node) {
    if (node.getEnd() <= position) {
      previous = node;
    }
    if (node.getStart(sourceFile) < position) {
      tsModule.forEachChild(node, visit);
    }
  }

  visit(sourceFile);
  return previous;
}
