import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { runCheck } from '../src/cli-check';
import { removeClasses } from '../src/css-parser';
import { writeFixture as _writeFixture } from './test-helpers';

const fixturesDir = path.join(__dirname, 'fixtures', 'cli-check');
const writeFixture = (name: string, content: string) => _writeFixture(fixturesDir, name, content);

function setupProject(files: Record<string, string>): string {
  fs.rmSync(fixturesDir, { recursive: true, force: true });
  fs.mkdirSync(fixturesDir, { recursive: true });

  for (const [name, content] of Object.entries(files)) {
    writeFixture(name, content);
  }

  // Write a minimal tsconfig
  const tsconfigPath = writeFixture('tsconfig.json', JSON.stringify({
    compilerOptions: {
      target: 'ES2020',
      module: 'ES2022',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      noEmit: true,
      strict: true,
    },
    include: ['.'],
  }));

  return tsconfigPath;
}

describe('cli check', () => {
  it('reports undefined class access', () => {
    const tsconfig = setupProject({
      'styles.module.scss': `.container { display: flex; }`,
      'app.tsx': `
import styles from './styles.module.scss';
const x = styles.container;
const y = styles.nonExistent;
`,
    });

    const result = runCheck(tsconfig);
    expect(result.exitCode).toBe(1);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].messageText).toContain('nonExistent');
  });

  it('exits 0 when no issues', () => {
    const tsconfig = setupProject({
      'styles.module.scss': `.container { display: flex; }\n.header { color: red; }`,
      'app.tsx': `
import styles from './styles.module.scss';
const x = styles.container;
const y = styles.header;
`,
    });

    const result = runCheck(tsconfig);
    expect(result.exitCode).toBe(0);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('reports unused classes', () => {
    const tsconfig = setupProject({
      'styles.module.scss': `.used { display: flex; }\n.unused { color: red; }`,
      'app.tsx': `
import styles from './styles.module.scss';
const x = styles.used;
`,
    });

    const result = runCheck(tsconfig);
    expect(result.exitCode).toBe(1);
    const unusedDiag = result.diagnostics.find(d => d.code === 100002);
    expect(unusedDiag).toBeDefined();
    expect(unusedDiag!.messageText).toContain('unused');
  });

  it('handles files with no CSS module imports', () => {
    const tsconfig = setupProject({
      'app.tsx': `const x = 'hello';`,
    });

    const result = runCheck(tsconfig);
    expect(result.exitCode).toBe(0);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('--fix removes unused classes from style files', () => {
    setupProject({
      'styles.module.scss': `.used { display: flex; }\n.unused { color: red; }\n`,
      'app.tsx': `
import styles from './styles.module.scss';
const x = styles.used;
`,
    });

    // First check should report unused
    const before = runCheck(path.join(fixturesDir, 'tsconfig.json'));
    const unusedDiag = before.diagnostics.find(d => d.code === 100002);
    expect(unusedDiag).toBeDefined();
    expect(unusedDiag!.messageText).toContain('unused');

    // Use the tracker to apply fix (same logic as cli check --fix)
    for (const scssFile of before.tracker.getTrackedStyleFiles()) {
      const unused = before.tracker.getUnusedClasses(scssFile);
      if (unused.length > 0) {
        removeClasses(scssFile, new Set(unused));
      }
    }

    // Re-check should be clean
    const after = runCheck(path.join(fixturesDir, 'tsconfig.json'));
    expect(after.exitCode).toBe(0);
    expect(after.diagnostics).toHaveLength(0);

    // Verify the file was actually modified
    const content = fs.readFileSync(path.join(fixturesDir, 'styles.module.scss'), 'utf-8');
    expect(content).toContain('.used');
    expect(content).not.toContain('.unused');
  });
});
