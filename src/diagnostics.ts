import path from 'path';
import type ts from 'typescript/lib/tsserverlibrary';
import { findCssModuleImports } from './css-module-imports';
import { UsageTracker } from './usage-tracker';

/**
 * Find all property accesses on a binding name in a source file.
 * Handles: s.className, s['className'], and destructuring patterns like { a, b } = s
 */
function findUsedClasses(
  tsModule: typeof ts,
  sourceFile: ts.SourceFile,
  bindingName: string
): Set<string> {
  const used = new Set<string>();

  function visit(node: ts.Node) {
    if (tsModule.isPropertyAccessExpression(node)) {
      if (tsModule.isIdentifier(node.expression) && node.expression.text === bindingName) {
        used.add(node.name.text);
      }
    } else if (tsModule.isElementAccessExpression(node)) {
      if (
        tsModule.isIdentifier(node.expression) &&
        node.expression.text === bindingName &&
        node.argumentExpression &&
        tsModule.isStringLiteral(node.argumentExpression)
      ) {
        used.add(node.argumentExpression.text);
      }
    } else if (tsModule.isVariableDeclaration(node)) {
      // Handle destructuring: const { a, b } = styles
      if (
        node.initializer &&
        tsModule.isIdentifier(node.initializer) &&
        node.initializer.text === bindingName &&
        tsModule.isObjectBindingPattern(node.name)
      ) {
        for (const element of node.name.elements) {
          // { className } or { className: alias }
          const propName = element.propertyName
            ? tsModule.isIdentifier(element.propertyName) ? element.propertyName.text
              : tsModule.isStringLiteral(element.propertyName) ? element.propertyName.text
              : null
            : tsModule.isIdentifier(element.name) ? element.name.text : null;
          if (propName) used.add(propName);
        }
      }
    }
    tsModule.forEachChild(node, visit);
  }

  visit(sourceFile);
  return used;
}

/**
 * Produce semantic diagnostics for CSS module usage in a TS file.
 */
export function getCssModuleDiagnostics(
  tsModule: typeof ts,
  fileName: string,
  program: ts.Program,
  tracker: UsageTracker
): ts.Diagnostic[] {
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) return [];

  const diagnostics: ts.Diagnostic[] = [];
  const imports = findCssModuleImports(tsModule, sourceFile, program);

  if (imports.length === 0) return [];

  // Clear previous usage data for this file before re-analyzing
  tracker.invalidateFile(fileName);

  for (const { bindingName, resolvedPath, importNode } of imports) {
    const parsed = tracker.getStyleFile(resolvedPath);
    if (!parsed) continue;

    const usedClasses = findUsedClasses(tsModule, sourceFile, bindingName);
    tracker.registerUsage(fileName, resolvedPath, usedClasses);

    // Report undefined classes (used in TS but not defined in SCSS)
    const undefinedClasses = tracker.getUndefinedClasses(resolvedPath, usedClasses);
    for (const cls of undefinedClasses) {
      // Find the node for this specific property access to get accurate position
      const diagnostic = findUndefinedClassDiagnostic(tsModule, sourceFile, bindingName, cls);
      if (diagnostic) {
        diagnostics.push({
          file: sourceFile,
          start: diagnostic.start,
          length: diagnostic.length,
          messageText: `CSS class '${cls}' is not defined in ${path.basename(resolvedPath)}`,
          category: tsModule.DiagnosticCategory.Error,
          code: 100001,
          source: 'css-modules-lint',
        });
      }
    }

    // Report unused classes (defined in SCSS but not used by ANY file)
    // We need to scan all files that import this style file
    scanAllImportersForUnused(tsModule, program, tracker, resolvedPath);

    const unusedClasses = tracker.getUnusedClasses(resolvedPath);
    if (unusedClasses.length > 0) {
      diagnostics.push({
        file: sourceFile,
        start: importNode.getStart(sourceFile),
        length: importNode.getWidth(sourceFile),
        messageText: `Unused classes in ${path.basename(resolvedPath)}: ${unusedClasses.join(', ')}`,
        category: tsModule.DiagnosticCategory.Warning,
        code: 100002,
        source: 'css-modules-lint',
      });
    }
  }

  return diagnostics;
}

/**
 * Scan all source files in the program that import a given style file,
 * and register their class usages with the tracker.
 *
 * Uses a per-program cache so we rescan when the program instance changes
 * (e.g. after a file edit triggers a new program).
 */
const scanCache = new WeakMap<ts.Program, Set<string>>();

function scanAllImportersForUnused(
  tsModule: typeof ts,
  program: ts.Program,
  tracker: UsageTracker,
  scssFile: string
): void {
  let scanned = scanCache.get(program);
  if (!scanned) {
    scanned = new Set();
    scanCache.set(program, scanned);
  }

  // Skip if we've already scanned all importers for this style file in this program
  if (scanned.has(scssFile)) return;
  scanned.add(scssFile);

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;

    const imports = findCssModuleImports(tsModule, sourceFile, program);
    for (const { bindingName, resolvedPath } of imports) {
      if (resolvedPath !== scssFile) continue;

      const usedClasses = findUsedClasses(tsModule, sourceFile, bindingName);
      tracker.registerUsage(sourceFile.fileName, resolvedPath, usedClasses);
    }
  }
}

/**
 * Find the position of a specific s.className or s['className'] access in the source.
 */
function findUndefinedClassDiagnostic(
  tsModule: typeof ts,
  sourceFile: ts.SourceFile,
  bindingName: string,
  className: string
): { start: number; length: number } | null {
  let result: { start: number; length: number } | null = null;

  function visit(node: ts.Node) {
    if (result) return;

    if (tsModule.isPropertyAccessExpression(node)) {
      if (
        tsModule.isIdentifier(node.expression) &&
        node.expression.text === bindingName &&
        node.name.text === className
      ) {
        result = { start: node.name.getStart(sourceFile), length: node.name.getWidth(sourceFile) };
      }
    } else if (tsModule.isElementAccessExpression(node)) {
      if (
        tsModule.isIdentifier(node.expression) &&
        node.expression.text === bindingName &&
        node.argumentExpression &&
        tsModule.isStringLiteral(node.argumentExpression) &&
        node.argumentExpression.text === className
      ) {
        result = {
          start: node.argumentExpression.getStart(sourceFile),
          length: node.argumentExpression.getWidth(sourceFile),
        };
      }
    }

    tsModule.forEachChild(node, visit);
  }

  visit(sourceFile);
  return result;
}
