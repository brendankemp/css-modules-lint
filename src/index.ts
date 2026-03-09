import type ts from 'typescript/lib/tsserverlibrary';
import { UsageTracker } from './usage-tracker';
import { getCssModuleDiagnostics } from './diagnostics';
import { getCssModuleCompletions } from './completions';
import { getCssModuleDefinition } from './definitions';

function init(modules: { typescript: typeof ts }) {
  const tsModule = modules.typescript;

  function create(info: ts.server.PluginCreateInfo): ts.LanguageService {
    const tracker = new UsageTracker();
    const ls = info.languageService;

    const log = (msg: string) => {
      info.project.projectService.logger.info(`[css-modules-lint] ${msg}`);
    };

    log('Plugin initialized');

    // Create proxy that delegates everything to the original language service
    const proxy = Object.create(null) as ts.LanguageService;
    for (const key of Object.keys(ls) as Array<keyof ts.LanguageService>) {
      const original = ls[key];
      if (typeof original === 'function') {
        (proxy as any)[key] = (...args: any[]) => (original as Function).apply(ls, args);
      }
    }

    // Override: Semantic Diagnostics
    proxy.getSemanticDiagnostics = (fileName: string) => {
      const prior = ls.getSemanticDiagnostics(fileName);
      const program = ls.getProgram();
      if (!program) return prior;

      try {
        const cssDiagnostics = getCssModuleDiagnostics(tsModule, fileName, program, tracker);
        return [...prior, ...cssDiagnostics];
      } catch (e) {
        log(`Error in diagnostics for ${fileName}: ${e}`);
        return prior;
      }
    };

    // Override: Completions
    proxy.getCompletionsAtPosition = (fileName, position, options, formattingSettings) => {
      const prior = ls.getCompletionsAtPosition(fileName, position, options, formattingSettings);
      const program = ls.getProgram();
      if (!program) return prior;

      try {
        const cssCompletions = getCssModuleCompletions(tsModule, fileName, position, program, tracker);
        if (cssCompletions && cssCompletions.length > 0) {
          if (prior) {
            prior.entries = [...cssCompletions, ...prior.entries];
            return prior;
          }
          return {
            isGlobalCompletion: false,
            isMemberCompletion: true,
            isNewIdentifierLocation: false,
            entries: cssCompletions,
          };
        }
      } catch (e) {
        log(`Error in completions for ${fileName}: ${e}`);
      }

      return prior;
    };

    // Override: Go-to-Definition
    proxy.getDefinitionAtPosition = (fileName, position) => {
      const program = ls.getProgram();
      if (program) {
        try {
          const cssDef = getCssModuleDefinition(tsModule, fileName, position, program, tracker);
          if (cssDef && cssDef.length > 0) {
            return cssDef;
          }
        } catch (e) {
          log(`Error in definitions for ${fileName}: ${e}`);
        }
      }
      return ls.getDefinitionAtPosition(fileName, position);
    };

    // Override: Go-to-Definition (bound span variant used by most editors)
    proxy.getDefinitionAndBoundSpan = (fileName, position) => {
      const program = ls.getProgram();
      if (program) {
        try {
          const cssDef = getCssModuleDefinition(tsModule, fileName, position, program, tracker);
          if (cssDef && cssDef.length > 0) {
            // Find the actual token at the cursor to determine the correct textSpan.
            // For `styles.foo` this is the identifier `foo`; for `styles['foo']` it's the string literal `'foo'`.
            const sourceFile = program.getSourceFile(fileName);
            let spanStart = position;
            let spanLength = cssDef[0].name.length;
            if (sourceFile) {
              const token = findTokenAtPosition(tsModule, sourceFile, position);
              if (token) {
                spanStart = token.getStart(sourceFile);
                spanLength = token.getWidth(sourceFile);
              }
            }
            return {
              definitions: cssDef,
              textSpan: { start: spanStart, length: spanLength },
            };
          }
        } catch (e) {
          log(`Error in definitions for ${fileName}: ${e}`);
        }
      }
      return ls.getDefinitionAndBoundSpan(fileName, position);
    };

    return proxy;
  }

  return { create };
}

function findTokenAtPosition(tsModule: typeof ts, sourceFile: ts.SourceFile, position: number): ts.Node | null {
  function find(node: ts.Node): ts.Node | null {
    if (position < node.getStart(sourceFile) || position >= node.getEnd()) return null;
    let result: ts.Node | null = null;
    tsModule.forEachChild(node, (child) => {
      if (!result) result = find(child);
    });
    return result ?? node;
  }
  return find(sourceFile);
}

export = init;
