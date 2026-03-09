import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import ts from 'typescript';
import { getCssModuleDefinition } from '../src/definitions';
import { UsageTracker } from '../src/usage-tracker';
import { writeFixture, createProgram } from './test-helpers';

const fixturesDir = path.join(__dirname, 'fixtures');

describe('getCssModuleDefinition', () => {
  let tracker: UsageTracker;

  beforeEach(() => {
    tracker = new UsageTracker();
  });

  it('returns definition pointing to SCSS file for styles.className', () => {
    const scssContent = `.container { display: flex; }\n.header { font-size: 20px; }`;
    writeFixture(fixturesDir, 'def.module.scss', scssContent);

    const tsContent = `import styles from './def.module.scss';\nconst x = styles.header;\n`;
    const program = createProgram(fixturesDir, {
      'def.module.scss': scssContent,
      'def-test.tsx': tsContent,
    });

    const headerPos = tsContent.indexOf('.header') + 1;
    const tsFile = path.join(fixturesDir, 'def-test.tsx');
    const result = getCssModuleDefinition(ts, tsFile, headerPos, program, tracker);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].fileName).toContain('def.module.scss');
    expect(result![0].textSpan.start).toBe(scssContent.indexOf('.header'));
  });

  it('returns definition with correct offset for first class', () => {
    const scssContent = `.first { color: red; }`;
    writeFixture(fixturesDir, 'def-first.module.scss', scssContent);

    const tsContent = `import styles from './def-first.module.scss';\nconst x = styles.first;\n`;
    const program = createProgram(fixturesDir, {
      'def-first.module.scss': scssContent,
      'def-first-test.tsx': tsContent,
    });

    const pos = tsContent.indexOf('.first') + 1;
    const tsFile = path.join(fixturesDir, 'def-first-test.tsx');
    const result = getCssModuleDefinition(ts, tsFile, pos, program, tracker);

    expect(result).not.toBeNull();
    expect(result![0].textSpan.start).toBe(0);
  });

  it('returns null when cursor is not on a class access', () => {
    const scssContent = `.container { display: flex; }`;
    writeFixture(fixturesDir, 'def-nocursor.module.scss', scssContent);

    const tsContent = `import styles from './def-nocursor.module.scss';\nconst x = 'hello';\n`;
    const program = createProgram(fixturesDir, {
      'def-nocursor.module.scss': scssContent,
      'def-nocursor-test.tsx': tsContent,
    });

    const pos = tsContent.indexOf("'hello'") + 1;
    const tsFile = path.join(fixturesDir, 'def-nocursor-test.tsx');
    const result = getCssModuleDefinition(ts, tsFile, pos, program, tracker);

    expect(result).toBeNull();
  });

  it('returns null for undefined class', () => {
    const scssContent = `.container { display: flex; }`;
    writeFixture(fixturesDir, 'def-undef.module.scss', scssContent);

    const tsContent = `import styles from './def-undef.module.scss';\nconst x = styles.nonExistent;\n`;
    const program = createProgram(fixturesDir, {
      'def-undef.module.scss': scssContent,
      'def-undef-test.tsx': tsContent,
    });

    const pos = tsContent.indexOf('.nonExistent') + 1;
    const tsFile = path.join(fixturesDir, 'def-undef-test.tsx');
    const result = getCssModuleDefinition(ts, tsFile, pos, program, tracker);

    expect(result).toBeNull();
  });

  it('handles bracket access styles["className"]', () => {
    const scssContent = `.container { display: flex; }`;
    writeFixture(fixturesDir, 'def-bracket.module.scss', scssContent);

    const tsContent = `import styles from './def-bracket.module.scss';\nconst x = styles['container'];\n`;
    const program = createProgram(fixturesDir, {
      'def-bracket.module.scss': scssContent,
      'def-bracket-test.tsx': tsContent,
    });

    const pos = tsContent.indexOf("'container'") + 1;
    const tsFile = path.join(fixturesDir, 'def-bracket-test.tsx');
    const result = getCssModuleDefinition(ts, tsFile, pos, program, tracker);

    expect(result).not.toBeNull();
    expect(result![0].fileName).toContain('def-bracket.module.scss');
    expect(result![0].textSpan.start).toBe(0);
  });
});
