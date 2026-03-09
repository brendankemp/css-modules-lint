import ts from 'typescript';
import type { Linter, Rule } from 'eslint';
import { UsageTracker } from './usage-tracker';
import { getCssModuleDiagnostics } from './diagnostics';

// Per-run state — reset when the program instance changes (new ESLint run or watch cycle)
let tracker = new UsageTracker();
let diagnosticsCache = new Map<string, ts.Diagnostic[]>();
let reportedUnused = new Set<string>();
let lastProgram: ts.Program | null = null;

function getDiagnostics(filename: string, program: ts.Program): ts.Diagnostic[] {
  // Reset caches when the program changes (new ESLint run or file change)
  if (program !== lastProgram) {
    tracker = new UsageTracker();
    diagnosticsCache = new Map();
    reportedUnused = new Set();
    lastProgram = program;
  }

  const cached = diagnosticsCache.get(filename);
  if (cached) return cached;
  const diags = getCssModuleDiagnostics(ts as any, filename, program, tracker);
  diagnosticsCache.set(filename, diags);
  return diags;
}

function getProgram(context: Rule.RuleContext): ts.Program | null {
  const services = (context.sourceCode as any).parserServices
    ?? (context as any).parserServices;
  return services?.program ?? services?.getProgram?.() ?? null;
}

const NO_PROGRAM_MESSAGE = 'css-modules rules require typescript-eslint with projectService enabled.';

const undefinedClass: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow using CSS class names not defined in the imported style file. If you use the vite plugin to generate .d.ts files, TypeScript already catches these — you can safely disable this rule.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        const program = getProgram(context);
        if (!program) {
          context.report({ message: NO_PROGRAM_MESSAGE, loc: { line: 1, column: 0 } });
          return;
        }
        const diagnostics = getDiagnostics(context.filename, program);

        for (const diag of diagnostics) {
          if (diag.code !== 100001) continue;
          if (diag.start == null || diag.length == null || !diag.file) continue;

          const startPos = diag.file.getLineAndCharacterOfPosition(diag.start);
          const endPos = diag.file.getLineAndCharacterOfPosition(diag.start + diag.length);
          const message = typeof diag.messageText === 'string'
            ? diag.messageText
            : ts.flattenDiagnosticMessageText(diag.messageText, ' ');

          context.report({
            message,
            loc: {
              start: { line: startPos.line + 1, column: startPos.character },
              end: { line: endPos.line + 1, column: endPos.character },
            },
          });
        }
      },
    };
  },
};

const unusedClass: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Warn when CSS classes defined in a style file are not used by any importer',
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        const program = getProgram(context);
        if (!program) {
          context.report({ message: NO_PROGRAM_MESSAGE, loc: { line: 1, column: 0 } });
          return;
        }
        const diagnostics = getDiagnostics(context.filename, program);

        for (const diag of diagnostics) {
          if (diag.code !== 100002) continue;
          if (diag.start == null || diag.length == null || !diag.file) continue;

          const message = typeof diag.messageText === 'string'
            ? diag.messageText
            : ts.flattenDiagnosticMessageText(diag.messageText, ' ');

          if (reportedUnused.has(message)) continue;
          reportedUnused.add(message);

          const startPos = diag.file.getLineAndCharacterOfPosition(diag.start);
          const endPos = diag.file.getLineAndCharacterOfPosition(diag.start + diag.length);

          context.report({
            message,
            loc: {
              start: { line: startPos.line + 1, column: startPos.character },
              end: { line: endPos.line + 1, column: endPos.character },
            },
          });
        }
      },
    };
  },
};

const plugin = {
  meta: {
    name: 'eslint-plugin-css-modules',
    version: '1.0.0',
  },
  rules: {
    'undefined-class': undefinedClass,
    'unused-class': unusedClass,
  } as Record<string, Rule.RuleModule>,
  configs: {} as Record<string, Linter.Config>,
};

plugin.configs.recommended = {
  plugins: {
    'css-modules': plugin as any,
  },
  rules: {
    'css-modules/undefined-class': 'error',
    'css-modules/unused-class': 'warn',
  },
};

export = plugin;
