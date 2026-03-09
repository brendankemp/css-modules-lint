import path from 'path';
import type ts from 'typescript/lib/tsserverlibrary';
import { isStyleFile, STYLE_EXTENSION_REGEX } from './css-parser';

export interface CssModuleImport {
  bindingName: string;
  resolvedPath: string;
  importNode: ts.ImportDeclaration;
}

/**
 * Resolve a style module specifier to its actual file path,
 * stripping .d.ts if TypeScript resolved to a declaration file.
 */
function resolveStylePath(
  tsModule: typeof ts,
  specifier: string,
  sourceFile: ts.SourceFile,
  program: ts.Program,
): string {
  const resolved = tsModule.resolveModuleName(
    specifier,
    sourceFile.fileName,
    program.getCompilerOptions(),
    tsModule.sys,
  );

  let resolvedPath: string;
  if (resolved.resolvedModule) {
    resolvedPath = resolved.resolvedModule.resolvedFileName;
  } else {
    resolvedPath = path.resolve(path.dirname(sourceFile.fileName), specifier);
  }

  if (resolvedPath.endsWith('.d.ts')) {
    const stripped = resolvedPath.slice(0, -5);
    if (isStyleFile(stripped)) {
      resolvedPath = stripped;
    }
  }

  return resolvedPath;
}

/**
 * Find all CSS module imports in a source file.
 */
export function findCssModuleImports(
  tsModule: typeof ts,
  sourceFile: ts.SourceFile,
  program: ts.Program,
): CssModuleImport[] {
  const imports: CssModuleImport[] = [];

  tsModule.forEachChild(sourceFile, (node) => {
    if (!tsModule.isImportDeclaration(node)) return;
    if (!node.moduleSpecifier || !tsModule.isStringLiteral(node.moduleSpecifier)) return;

    const specifier = node.moduleSpecifier.text;
    if (!STYLE_EXTENSION_REGEX.test(specifier)) return;

    const importClause = node.importClause;
    if (!importClause) return;

    let bindingName: string | null = null;

    if (importClause.name) {
      // import styles from './x.module.scss'
      bindingName = importClause.name.text;
    } else if (
      importClause.namedBindings &&
      tsModule.isNamespaceImport(importClause.namedBindings)
    ) {
      // import * as styles from './x.module.scss'
      bindingName = importClause.namedBindings.name.text;
    }

    if (!bindingName) return;

    const resolvedPath = resolveStylePath(tsModule, specifier, sourceFile, program);
    imports.push({ bindingName, resolvedPath, importNode: node });
  });

  return imports;
}

/**
 * Find the CSS module import for a specific binding name (e.g. "styles").
 */
export function findCssModuleImportForBinding(
  tsModule: typeof ts,
  sourceFile: ts.SourceFile,
  bindingName: string,
  program: ts.Program,
): { resolvedPath: string } | null {
  const imports = findCssModuleImports(tsModule, sourceFile, program);
  const match = imports.find((imp) => imp.bindingName === bindingName);
  return match ? { resolvedPath: match.resolvedPath } : null;
}
