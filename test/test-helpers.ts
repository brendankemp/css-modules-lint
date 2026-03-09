import path from 'path';
import fs from 'fs';
import ts from 'typescript';

const baseFixturesDir = path.join(__dirname, 'fixtures');

export function writeFixture(fixturesDir: string, name: string, content: string): string {
  const filePath = path.join(fixturesDir, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

export function createProgram(
  fixturesDir: string,
  files: Record<string, string>,
  opts?: { setParents?: boolean }
): ts.Program {
  const fileMap = new Map<string, string>();
  const fileNames: string[] = [];

  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(fixturesDir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
    fileMap.set(filePath, content);
    if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      fileNames.push(filePath);
    }
  }

  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    noEmit: true,
    strict: true,
  };

  const host = ts.createCompilerHost(options);
  const originalReadFile = host.readFile.bind(host);
  host.readFile = (fileName: string) => {
    const normalized = path.resolve(fileName);
    if (fileMap.has(normalized)) return fileMap.get(normalized)!;
    return originalReadFile(fileName);
  };
  const originalFileExists = host.fileExists.bind(host);
  host.fileExists = (fileName: string) => {
    const normalized = path.resolve(fileName);
    if (fileMap.has(normalized)) return true;
    return originalFileExists(fileName);
  };

  if (opts?.setParents) {
    const origGetSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (fileName, languageVersion, onError) => {
      const sf = origGetSourceFile(fileName, languageVersion, onError);
      if (sf) {
        (function setParents(node: ts.Node) {
          ts.forEachChild(node, (child) => {
            child.parent = node;
            setParents(child);
          });
        })(sf);
      }
      return sf;
    };
  }

  return ts.createProgram(fileNames, options, host);
}
