import fs from 'fs';
import path from 'path';
import postcss, { Root, Rule, AtRule } from 'postcss';
import postcssScss from 'postcss-scss';
import postcssLess from 'postcss-less';
import selectorParser from 'postcss-selector-parser';

type ClassMapType = boolean | string;
type ClassMap = Record<string, ClassMapType>;

export interface ParsedStyleFile {
  /** Map of class names. Value is false (unused), true (used/composed), or a string (original name). */
  classes: Record<string, ClassMapType>;
  /** Map of ICSS :export property names. */
  exportProps: Record<string, string>;
}

// --- AST Parsing ---

function getSyntax(filePath: string) {
  const ext = path.extname(filePath).slice(1);
  return ext === 'less' ? postcssLess : ext === 'scss' ? postcssScss : undefined;
}

function getAST(filePath: string): Root | null {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const syntax = getSyntax(filePath);

  try {
    const result = postcss().process(fileContent, { syntax, from: filePath }).root;
    return result.type === 'root' ? result : null;
  } catch {
    return null;
  }
}

// --- Class Extraction ---

function getICSSExportPropsMap(ast: Root): ClassMap {
  const result: ClassMap = {};
  ast.walkRules((rule) => {
    if (rule.selector.trim() === ':export') {
      rule.walkDecls((decl) => { result[decl.prop] = decl.prop; });
    }
  });
  return result;
}

function getRegularClassesMap(ast: Root): ClassMap {
  const result: ClassMap = {};
  ast.walkRules((rule) => {
    if (rule.selector.includes(':export')) return;
    const selectorAST = selectorParser().astSync(rule.selector);
    selectorAST.walkClasses((classNode) => { result[classNode.value] = false; });
  });
  return result;
}

function getComposesClassesMap(ast: Root): ClassMap {
  const result: ClassMap = {};
  ast.walkDecls('composes', (decl) => {
    const value = decl.value.trim();
    if (value.includes(' from ')) return;
    for (const name of value.split(/\s+/)) {
      result[name] = true;
    }
  });
  return result;
}

function getExtendClassesMap(ast: Root): ClassMap {
  const result: ClassMap = {};
  ast.walkAtRules('extend', (atRule) => {
    const match = atRule.params.match(/\.([a-zA-Z_][\w-]*)/);
    if (match) result[match[1]] = true;
  });
  return result;
}

interface ResolvedSelector {
  rule: Rule;
  resolvedClasses: string[];
  ownClasses: string[];
  suffixes: string[];
  parentClassNames: string[];
}

/**
 * Shared traversal for parent selector resolution.
 * Walks nested rules and calls `visitor` with the resolved class info for each rule.
 */
function walkNestedRules(
  ast: Root,
  visitor: (info: ResolvedSelector) => void,
): void {
  const resolve = (rule: Rule, parentClassNames: string[]) => {
    const selectorStr = rule.selector;
    const ampersandPattern = /&([_\-a-zA-Z][\w-]*)/g;
    const suffixes: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = ampersandPattern.exec(selectorStr)) !== null) {
      suffixes.push(match[1]);
    }

    const resolvedClasses: string[] = [];
    if (suffixes.length > 0 && parentClassNames.length > 0) {
      for (const parentClass of parentClassNames) {
        for (const suffix of suffixes) {
          resolvedClasses.push(parentClass + suffix);
        }
      }
    }

    const ownClasses: string[] = [];
    if (!selectorStr.includes('&')) {
      const selectorAST = selectorParser().astSync(selectorStr);
      selectorAST.walkClasses((classNode) => { ownClasses.push(classNode.value); });
    }

    visitor({ rule, resolvedClasses, ownClasses, suffixes, parentClassNames });

    const effectiveClasses = [...resolvedClasses, ...ownClasses];

    rule.each((child) => {
      if (child.type === 'rule') {
        resolve(child as Rule, effectiveClasses.length > 0 ? effectiveClasses : parentClassNames);
      } else if (child.type === 'atrule') {
        (child as AtRule).each((nested) => {
          if (nested.type === 'rule') {
            resolve(nested as Rule, effectiveClasses.length > 0 ? effectiveClasses : parentClassNames);
          }
        });
      }
    });
  };

  ast.walkRules((rule) => {
    if (rule.parent?.type === 'root' || rule.parent?.type === 'atrule') {
      const selectorAST = selectorParser().astSync(rule.selector);
      const topClasses: string[] = [];
      selectorAST.walkClasses((classNode) => { topClasses.push(classNode.value); });
      if (topClasses.length > 0) resolve(rule, topClasses);
    }
  });
}

function getParentSelectorClassesMap(ast: Root): ClassMap {
  const result: ClassMap = {};

  walkNestedRules(ast, ({ rule, resolvedClasses, ownClasses }) => {
    for (const cls of resolvedClasses) {
      result[cls] = false;
    }

    if (ownClasses.length > 0) {
      const hasChildNesting = rule.some((child) => {
        if (child.type === 'rule') return (child as Rule).selector.includes('&');
        if (child.type === 'atrule') {
          let found = false;
          (child as AtRule).each((nested) => {
            if (nested.type === 'rule' && (nested as Rule).selector.includes('&')) found = true;
          });
          return found;
        }
        return false;
      });
      const hasOwnDeclarations = rule.some((child) => child.type === 'decl');
      if (hasChildNesting && !hasOwnDeclarations) {
        for (const cls of ownClasses) result[cls] = true;
      }
    }
  });

  return result;
}

function eliminateGlobals(ast: Root): void {
  ast.walkRules((rule) => {
    if (rule.selector.trim() === ':global') { rule.remove(); return; }

    const transformed = selectorParser((selectors) => {
      selectors.each((selector) => {
        let inGlobalScope = false;
        const nodesToRemove: selectorParser.Node[] = [];

        selector.each((node) => {
          if (node.type === 'pseudo' && node.value === ':global') {
            if (node.nodes && node.nodes.length > 0) {
              nodesToRemove.push(node);
            } else {
              inGlobalScope = true;
              nodesToRemove.push(node);
            }
          } else if (node.type === 'pseudo' && node.value === ':local' && (!node.nodes || node.nodes.length === 0)) {
            inGlobalScope = false;
          } else if (inGlobalScope && node.type === 'class') {
            nodesToRemove.push(node);
          }
        });

        for (const n of nodesToRemove) n.remove();

        let prev: selectorParser.Node | undefined;
        const extraCombinators: selectorParser.Node[] = [];
        selector.each((node) => {
          if (node.type === 'combinator' && prev?.type === 'combinator') extraCombinators.push(node);
          prev = node;
        });
        for (const c of extraCombinators) c.remove();

        while (selector.first?.type === 'combinator') selector.first.remove();
        while (selector.last?.type === 'combinator') selector.last.remove();
      });

      selectors.each((selector) => {
        const hasContent = selector.nodes.some((n) => n.type !== 'combinator' && n.type !== 'comment');
        if (!hasContent) selector.remove();
      });
    }).processSync(rule.selector);

    if (transformed.trim() === '') {
      rule.remove();
    } else {
      rule.selector = transformed;
    }
  });
}

// --- Public API ---

export const STYLE_EXTENSION_REGEX = /\.module\.(?:s?css|less)$/;

export function isStyleFile(filePath: string): boolean {
  return STYLE_EXTENSION_REGEX.test(filePath);
}

export function parseStyleFile(filePath: string): ParsedStyleFile | null {
  const ast = getAST(filePath);
  if (!ast) return null;

  eliminateGlobals(ast);

  // Build classes map with correct precedence: composes/extend marks override regular/parent
  const regular = getRegularClassesMap(ast);
  const composed = getComposesClassesMap(ast);
  const extended = getExtendClassesMap(ast);
  const parentSelector = getParentSelectorClassesMap(ast);

  const classes: Record<string, ClassMapType> = { ...regular, ...parentSelector };
  // Apply composes/extend last so they don't get overridden back to false
  for (const [key, value] of Object.entries(composed)) {
    classes[key] = value;
  }
  for (const [key, value] of Object.entries(extended)) {
    classes[key] = value;
  }

  const exportProps: Record<string, string> = {};
  for (const [key, value] of Object.entries(getICSSExportPropsMap(ast))) {
    exportProps[key] = String(value);
  }

  return { classes, exportProps };
}

/**
 * Find the position of a class definition in a style file.
 * Returns 0-based line/character and byte offset of the `.className` selector.
 * Applies eliminateGlobals for consistency with parseStyleFile.
 */
export function findClassPosition(filePath: string, className: string): { line: number; character: number; offset: number } | null {
  const ast = getAST(filePath);
  if (!ast) return null;

  eliminateGlobals(ast);

  const source = ast.source?.input?.css;
  if (!source) return null;

  const escapedName = className.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  const classPattern = new RegExp(`\\.${escapedName}(?![\\w-])`);

  let found: { line: number; character: number; offset: number } | null = null;

  ast.walkRules((rule) => {
    if (found) return;
    if (!classPattern.test(rule.selector) || !rule.source?.start) return;

    // Calculate the byte offset of the rule start in the original source
    const ruleStartLine = rule.source.start.line - 1;
    const ruleStartCol = rule.source.start.column - 1;
    const lines = source.split('\n');
    let ruleOffset = 0;
    for (let i = 0; i < ruleStartLine; i++) {
      ruleOffset += lines[i].length + 1; // +1 for \n
    }
    ruleOffset += ruleStartCol;

    // Find the exact .className position within the selector portion of source
    const selectorSource = source.slice(ruleOffset);
    const match = classPattern.exec(selectorSource);
    if (!match) return;

    const offset = ruleOffset + match.index;

    // Convert offset to line/character
    let line = 0;
    let charCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const nextCharCount = charCount + lines[i].length + (i < lines.length - 1 ? 1 : 0);
      if (offset < nextCharCount || i === lines.length - 1) {
        line = i;
        break;
      }
      charCount = nextCharCount;
    }
    const character = offset - charCount;

    found = { line, character, offset };
  });

  return found;
}

/**
 * Remove CSS class rules from a style file.
 * For multi-selector rules, only the matching selector is removed.
 * Returns true if any changes were made.
 */
export function removeClasses(filePath: string, classNames: Set<string>): boolean {
  const ast = getAST(filePath);
  if (!ast) return false;

  // Build a map of resolved nested class names → the rule that defines them
  // e.g. "parent-child" → rule with selector "&-child"
  const nestedClassMap = new Map<string, { rule: Rule; suffix: string; parentClasses: string[] }>();
  buildNestedClassMap(ast, nestedClassMap);

  let changed = false;

  // First pass: remove nested rules whose resolved names are in classNames
  for (const [fullName, info] of nestedClassMap) {
    if (!classNames.has(fullName)) continue;
    info.rule.remove();
    changed = true;
  }

  // Second pass: remove top-level selectors matching classNames
  ast.walkRules((rule) => {
    if (rule.selector.includes(':export')) return;
    if (rule.selector.includes('&')) return; // nested rules handled above

    const transformed = selectorParser((selectors) => {
      selectors.each((selector) => {
        const classes: string[] = [];
        selector.walkClasses((classNode) => { classes.push(classNode.value); });

        // Remove this selector if ALL its classes are in the removal set
        // and it has at least one class
        if (classes.length > 0 && classes.every(cls => classNames.has(cls))) {
          selector.remove();
        }
      });
    }).processSync(rule.selector);

    if (transformed.trim() === '') {
      rule.remove();
      changed = true;
    } else if (transformed !== rule.selector) {
      rule.selector = transformed;
      changed = true;
    }
  });

  // Clean up empty at-rules (e.g. @media blocks with no rules left)
  ast.walkAtRules((atRule) => {
    if (atRule.nodes && atRule.nodes.length === 0) {
      atRule.remove();
    }
  });

  // Clean up parent rules that now have no children and no declarations
  ast.walkRules((rule) => {
    if (rule.nodes && rule.nodes.length === 0) {
      rule.remove();
    }
  });

  if (!changed) return false;

  const syntax = getSyntax(filePath);
  const output = ast.toResult({ syntax: syntax as any }).css;
  try {
    fs.writeFileSync(filePath, output);
  } catch (e) {
    console.error(`Failed to write ${filePath}: ${e}`);
    return false;
  }
  return true;
}

function buildNestedClassMap(
  ast: Root,
  map: Map<string, { rule: Rule; suffix: string; parentClasses: string[] }>
): void {
  walkNestedRules(ast, ({ rule, suffixes, parentClassNames }) => {
    for (const suffix of suffixes) {
      for (const parentClass of parentClassNames) {
        map.set(parentClass + suffix, { rule, suffix, parentClasses: parentClassNames });
      }
    }
  });
}
