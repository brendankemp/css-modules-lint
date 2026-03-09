import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import ts from 'typescript';
import { findCssModuleImports, findCssModuleImportForBinding } from '../src/css-module-imports';
import { createProgram, writeFixture } from './test-helpers';

const fixturesDir = path.join(__dirname, 'fixtures', 'imports');

describe('findCssModuleImports', () => {
  it('finds default import', () => {
    fs.mkdirSync(fixturesDir, { recursive: true });
    writeFixture(fixturesDir, 'imp.module.scss', `.foo { color: red; }`);

    const tsContent = `import styles from './imp.module.scss';\nconst x = styles.foo;\n`;
    const program = createProgram(fixturesDir, {
      'imp.module.scss': `.foo { color: red; }`,
      'imp.tsx': tsContent,
    });

    const sourceFile = program.getSourceFile(path.join(fixturesDir, 'imp.tsx'))!;
    const imports = findCssModuleImports(ts, sourceFile, program);

    expect(imports).toHaveLength(1);
    expect(imports[0].bindingName).toBe('styles');
    expect(imports[0].resolvedPath).toContain('imp.module.scss');
  });

  it('finds namespace import (import * as styles)', () => {
    fs.mkdirSync(fixturesDir, { recursive: true });
    writeFixture(fixturesDir, 'ns.module.scss', `.bar { color: blue; }`);

    const tsContent = `import * as styles from './ns.module.scss';\nconst x = styles.bar;\n`;
    const program = createProgram(fixturesDir, {
      'ns.module.scss': `.bar { color: blue; }`,
      'ns.tsx': tsContent,
    });

    const sourceFile = program.getSourceFile(path.join(fixturesDir, 'ns.tsx'))!;
    const imports = findCssModuleImports(ts, sourceFile, program);

    expect(imports).toHaveLength(1);
    expect(imports[0].bindingName).toBe('styles');
  });

  it('ignores non-CSS-module imports', () => {
    fs.mkdirSync(fixturesDir, { recursive: true });

    const tsContent = `import something from './other';\nconst x = something.foo;\n`;
    const program = createProgram(fixturesDir, {
      'other.ts': `export default {};`,
      'non-css.tsx': tsContent,
    });

    const sourceFile = program.getSourceFile(path.join(fixturesDir, 'non-css.tsx'))!;
    const imports = findCssModuleImports(ts, sourceFile, program);

    expect(imports).toHaveLength(0);
  });

  it('ignores named imports without default', () => {
    fs.mkdirSync(fixturesDir, { recursive: true });
    writeFixture(fixturesDir, 'named.module.scss', `.foo { color: red; }`);

    const tsContent = `import { something } from './named.module.scss';\n`;
    const program = createProgram(fixturesDir, {
      'named.module.scss': `.foo { color: red; }`,
      'named.tsx': tsContent,
    });

    const sourceFile = program.getSourceFile(path.join(fixturesDir, 'named.tsx'))!;
    const imports = findCssModuleImports(ts, sourceFile, program);

    expect(imports).toHaveLength(0);
  });

  it('finds imports for .module.css', () => {
    fs.mkdirSync(fixturesDir, { recursive: true });
    writeFixture(fixturesDir, 'plain.module.css', `.bar { color: blue; }`);

    const tsContent = `import styles from './plain.module.css';\n`;
    const program = createProgram(fixturesDir, {
      'plain.module.css': `.bar { color: blue; }`,
      'plain.tsx': tsContent,
    });

    const sourceFile = program.getSourceFile(path.join(fixturesDir, 'plain.tsx'))!;
    const imports = findCssModuleImports(ts, sourceFile, program);

    expect(imports).toHaveLength(1);
    expect(imports[0].resolvedPath).toContain('plain.module.css');
  });

  it('finds imports for .module.less', () => {
    fs.mkdirSync(fixturesDir, { recursive: true });
    writeFixture(fixturesDir, 'styles.module.less', `.baz { color: green; }`);

    const tsContent = `import styles from './styles.module.less';\n`;
    const program = createProgram(fixturesDir, {
      'styles.module.less': `.baz { color: green; }`,
      'less.tsx': tsContent,
    });

    const sourceFile = program.getSourceFile(path.join(fixturesDir, 'less.tsx'))!;
    const imports = findCssModuleImports(ts, sourceFile, program);

    expect(imports).toHaveLength(1);
    expect(imports[0].resolvedPath).toContain('styles.module.less');
  });
});

describe('findCssModuleImportForBinding', () => {
  it('finds import for a given binding name', () => {
    fs.mkdirSync(fixturesDir, { recursive: true });
    writeFixture(fixturesDir, 'bind.module.scss', `.foo { color: red; }`);

    const tsContent = `import myStyles from './bind.module.scss';\n`;
    const program = createProgram(fixturesDir, {
      'bind.module.scss': `.foo { color: red; }`,
      'bind.tsx': tsContent,
    });

    const sourceFile = program.getSourceFile(path.join(fixturesDir, 'bind.tsx'))!;
    const result = findCssModuleImportForBinding(ts, sourceFile, 'myStyles', program);

    expect(result).not.toBeNull();
    expect(result!.resolvedPath).toContain('bind.module.scss');
  });

  it('returns null for non-matching binding name', () => {
    fs.mkdirSync(fixturesDir, { recursive: true });
    writeFixture(fixturesDir, 'nobind.module.scss', `.foo { color: red; }`);

    const tsContent = `import styles from './nobind.module.scss';\n`;
    const program = createProgram(fixturesDir, {
      'nobind.module.scss': `.foo { color: red; }`,
      'nobind.tsx': tsContent,
    });

    const sourceFile = program.getSourceFile(path.join(fixturesDir, 'nobind.tsx'))!;
    const result = findCssModuleImportForBinding(ts, sourceFile, 'nonExistent', program);

    expect(result).toBeNull();
  });
});
