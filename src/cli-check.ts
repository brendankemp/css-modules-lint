import ts from 'typescript';
import path from 'path';
import { UsageTracker } from './usage-tracker';
import { getCssModuleDiagnostics } from './diagnostics';
import { removeClasses } from './css-parser';

export function runCheck(tsconfigPath: string): { diagnostics: ts.Diagnostic[]; exitCode: number; tracker: UsageTracker } {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    const msg = ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n');
    console.error(`Error reading ${tsconfigPath}: ${msg}`);
    return { diagnostics: [], exitCode: 1, tracker: new UsageTracker() };
  }

  const configDir = path.dirname(tsconfigPath);
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    configDir
  );

  const tracker = new UsageTracker();
  const allDiagnostics: ts.Diagnostic[] = [];
  const reportedUnused = new Set<string>();

  // Recursively check any project references
  if (parsed.projectReferences) {
    for (const ref of parsed.projectReferences) {
      const refPath = ts.resolveProjectReferencePath(ref);
      const result = runCheck(refPath);
      allDiagnostics.push(...result.diagnostics);
      tracker.merge(result.tracker);
    }
  }

  // Check files in this config
  if (parsed.fileNames.length > 0) {
    const program = ts.createProgram(parsed.fileNames, parsed.options);

    for (const sourceFile of program.getSourceFiles()) {
      if (sourceFile.isDeclarationFile) continue;
      if (sourceFile.fileName.includes('node_modules')) continue;

      const diags = getCssModuleDiagnostics(ts as any, sourceFile.fileName, program, tracker);
      for (const diag of diags) {
        // Deduplicate unused class warnings — only report once per SCSS file
        if (diag.code === 100002) {
          const msg = typeof diag.messageText === 'string' ? diag.messageText : '';
          if (reportedUnused.has(msg)) continue;
          reportedUnused.add(msg);
        }
        allDiagnostics.push(diag);
      }
    }
  }

  return {
    diagnostics: allDiagnostics,
    exitCode: allDiagnostics.length > 0 ? 1 : 0,
    tracker,
  };
}

export function check(args: string[]): number {
  const projectIndex = args.indexOf('--project');
  let tsconfigPath: string;
  if (projectIndex !== -1) {
    const projectArg = args[projectIndex + 1];
    if (!projectArg || projectArg.startsWith('--')) {
      console.error('Error: --project requires a path argument.');
      return 1;
    }
    tsconfigPath = path.resolve(projectArg);
  } else {
    tsconfigPath = path.resolve('tsconfig.json');
  }
  const fix = args.includes('--fix');

  let { diagnostics, exitCode, tracker } = runCheck(tsconfigPath);

  if (fix) {
    // Collect unused classes per style file and remove them
    let fixedFiles = 0;
    for (const scssFile of tracker.getTrackedStyleFiles()) {
      const unused = tracker.getUnusedClasses(scssFile);
      if (unused.length === 0) continue;
      if (removeClasses(scssFile, new Set(unused))) {
        console.log(`Fixed: removed ${unused.length} unused class${unused.length !== 1 ? 'es' : ''} from ${path.basename(scssFile)}`);
        fixedFiles++;
      }
    }

    if (fixedFiles > 0) {
      // Re-check after fixes to report remaining issues
      ({ diagnostics, exitCode } = runCheck(tsconfigPath));
    }
  }

  if (diagnostics.length === 0) {
    console.log('No CSS module issues found.');
    return 0;
  }

  const errors = diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error);
  const warnings = diagnostics.filter(d => d.category === ts.DiagnosticCategory.Warning);

  const formatHost: ts.FormatDiagnosticsHost = {
    getCanonicalFileName: (f) => f,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  };

  if (errors.length > 0) {
    console.error(ts.formatDiagnosticsWithColorAndContext(errors, formatHost));
  }
  if (warnings.length > 0) {
    console.error(ts.formatDiagnosticsWithColorAndContext(warnings, formatHost));
  }

  const summary = [
    errors.length > 0 ? `${errors.length} error${errors.length !== 1 ? 's' : ''}` : '',
    warnings.length > 0 ? `${warnings.length} warning${warnings.length !== 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(', ');
  console.error(`Found ${summary}.`);

  return exitCode;
}
