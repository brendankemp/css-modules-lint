import path from 'path';
import type ts from 'typescript/lib/tsserverlibrary';
import { findCssModuleImportForBinding } from './css-module-imports';
import { findClassPosition } from './css-parser';
import { UsageTracker } from './usage-tracker';

/**
 * Provide go-to-definition for CSS module class references.
 * When the user ctrl+clicks on `styles.card`, jump to `.card` in the SCSS file.
 */
export function getCssModuleDefinition(
  tsModule: typeof ts,
  fileName: string,
  position: number,
  program: ts.Program,
  tracker: UsageTracker
): ts.DefinitionInfo[] | null {
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) return null;

  // Find the token at position
  const access = findClassAccessAtPosition(tsModule, sourceFile, position);
  if (!access) return null;

  // Find the import for this binding
  const importInfo = findCssModuleImportForBinding(tsModule, sourceFile, access.bindingName, program);
  if (!importInfo) return null;

  // Find the class position in the style file
  const classPos = findClassPosition(importInfo.resolvedPath, access.className);
  if (!classPos) return null;

  return [{
    fileName: importInfo.resolvedPath,
    textSpan: { start: classPos.offset, length: access.className.length + 1 }, // +1 for the leading dot
    kind: tsModule.ScriptElementKind.memberVariableElement,
    name: access.className,
    containerName: path.basename(importInfo.resolvedPath),
    containerKind: tsModule.ScriptElementKind.moduleElement,
  }];
}

interface ClassAccess {
  bindingName: string;
  className: string;
}

function findClassAccessAtPosition(
  tsModule: typeof ts,
  sourceFile: ts.SourceFile,
  position: number
): ClassAccess | null {
  function find(node: ts.Node): ClassAccess | null {
    if (position >= node.getStart(sourceFile) && position < node.getEnd()) {
      // Check if this is styles.className
      if (tsModule.isPropertyAccessExpression(node) && tsModule.isIdentifier(node.expression)) {
        if (position >= node.name.getStart(sourceFile) && position < node.name.getEnd()) {
          return { bindingName: node.expression.text, className: node.name.text };
        }
      }
      // Check if this is styles['className']
      if (
        tsModule.isElementAccessExpression(node) &&
        tsModule.isIdentifier(node.expression) &&
        node.argumentExpression &&
        tsModule.isStringLiteral(node.argumentExpression)
      ) {
        if (position >= node.argumentExpression.getStart(sourceFile) && position < node.argumentExpression.getEnd()) {
          return { bindingName: node.expression.text, className: node.argumentExpression.text };
        }
      }

      // Recurse into children
      let result: ClassAccess | null = null;
      tsModule.forEachChild(node, (child) => {
        if (!result) result = find(child);
      });
      return result;
    }
    return null;
  }

  return find(sourceFile);
}

