import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import ts from 'typescript';
import { getCssModuleDiagnostics } from '../src/diagnostics';
import { UsageTracker } from '../src/usage-tracker';
import { writeFixture, createProgram } from './test-helpers';

const fixturesDir = path.join(__dirname, 'fixtures');

describe('getCssModuleDiagnostics', () => {
  let tracker: UsageTracker;

  beforeEach(() => {
    tracker = new UsageTracker();
  });

  it('reports undefined class access', () => {
    const scssFile = writeFixture(fixturesDir, 'diag.module.scss', `
      .container { display: flex; }
      .header { font-size: 20px; }
    `);

    const tsContent = `
import styles from './diag.module.scss';
const x = styles.container;
const y = styles.nonExistent;
`;
    const program = createProgram(fixturesDir, {
      'diag.module.scss': fs.readFileSync(scssFile, 'utf-8'),
      'diag-test.tsx': tsContent,
    });

    const tsFile = path.join(fixturesDir, 'diag-test.tsx');
    const diagnostics = getCssModuleDiagnostics(ts, tsFile, program, tracker);

    const undefinedDiags = diagnostics.filter(d => d.code === 100001);
    expect(undefinedDiags).toHaveLength(1);
    expect(undefinedDiags[0].messageText).toContain('nonExistent');
    expect(undefinedDiags[0].messageText).toContain('diag.module.scss');
  });

  it('does not report defined class access', () => {
    const scssFile = writeFixture(fixturesDir, 'diag-valid.module.scss', `
      .container { display: flex; }
      .header { font-size: 20px; }
    `);

    const tsContent = `
import styles from './diag-valid.module.scss';
const x = styles.container;
const y = styles.header;
`;
    const program = createProgram(fixturesDir, {
      'diag-valid.module.scss': fs.readFileSync(scssFile, 'utf-8'),
      'diag-valid-test.tsx': tsContent,
    });

    const tsFile = path.join(fixturesDir, 'diag-valid-test.tsx');
    const diagnostics = getCssModuleDiagnostics(ts, tsFile, program, tracker);

    const undefinedDiags = diagnostics.filter(d => d.code === 100001);
    expect(undefinedDiags).toHaveLength(0);
  });

  it('reports multiple undefined classes', () => {
    writeFixture(fixturesDir, 'diag-multi.module.scss', `.container { display: flex; }`);

    const tsContent = `
import styles from './diag-multi.module.scss';
const a = styles.foo;
const b = styles.bar;
const c = styles.container;
`;
    const program = createProgram(fixturesDir, {
      'diag-multi.module.scss': `.container { display: flex; }`,
      'diag-multi-test.tsx': tsContent,
    });

    const tsFile = path.join(fixturesDir, 'diag-multi-test.tsx');
    const diagnostics = getCssModuleDiagnostics(ts, tsFile, program, tracker);

    const undefinedDiags = diagnostics.filter(d => d.code === 100001);
    expect(undefinedDiags).toHaveLength(2);
    const messages = undefinedDiags.map(d => d.messageText as string);
    expect(messages.some(m => m.includes('foo'))).toBe(true);
    expect(messages.some(m => m.includes('bar'))).toBe(true);
  });

  it('reports unused classes', () => {
    writeFixture(fixturesDir, 'diag-unused.module.scss', `
      .used { display: flex; }
      .unused { color: red; }
    `);

    const tsContent = `
import styles from './diag-unused.module.scss';
const x = styles.used;
`;
    const program = createProgram(fixturesDir, {
      'diag-unused.module.scss': `.used { display: flex; }\n.unused { color: red; }`,
      'diag-unused-test.tsx': tsContent,
    });

    const tsFile = path.join(fixturesDir, 'diag-unused-test.tsx');
    const diagnostics = getCssModuleDiagnostics(ts, tsFile, program, tracker);

    const unusedDiags = diagnostics.filter(d => d.code === 100002);
    expect(unusedDiags).toHaveLength(1);
    expect(unusedDiags[0].messageText).toContain('unused');
  });

  it('handles bracket access styles["className"]', () => {
    writeFixture(fixturesDir, 'diag-bracket.module.scss', `.container { display: flex; }`);

    const tsContent = `
import styles from './diag-bracket.module.scss';
const x = styles['container'];
const y = styles['missing'];
`;
    const program = createProgram(fixturesDir, {
      'diag-bracket.module.scss': `.container { display: flex; }`,
      'diag-bracket-test.tsx': tsContent,
    });

    const tsFile = path.join(fixturesDir, 'diag-bracket-test.tsx');
    const diagnostics = getCssModuleDiagnostics(ts, tsFile, program, tracker);

    const undefinedDiags = diagnostics.filter(d => d.code === 100001);
    expect(undefinedDiags).toHaveLength(1);
    expect(undefinedDiags[0].messageText).toContain('missing');
  });

  it('returns no diagnostics for non-css-module files', () => {
    const tsContent = `
import { something } from './other';
const x = something.foo;
`;
    const program = createProgram(fixturesDir, {
      'no-css-test.tsx': tsContent,
    });

    const tsFile = path.join(fixturesDir, 'no-css-test.tsx');
    const diagnostics = getCssModuleDiagnostics(ts, tsFile, program, tracker);
    expect(diagnostics).toHaveLength(0);
  });

  it('handles destructured styles without false unused warnings', () => {
    writeFixture(fixturesDir, 'diag-destruct.module.scss', `.container { display: flex; }\n.header { color: red; }`);

    const tsContent = `
import styles from './diag-destruct.module.scss';
const { container, header } = styles;
`;
    const program = createProgram(fixturesDir, {
      'diag-destruct.module.scss': `.container { display: flex; }\n.header { color: red; }`,
      'diag-destruct-test.tsx': tsContent,
    });

    const tsFile = path.join(fixturesDir, 'diag-destruct-test.tsx');
    const diagnostics = getCssModuleDiagnostics(ts, tsFile, program, tracker);

    const unusedDiags = diagnostics.filter(d => d.code === 100002);
    expect(unusedDiags).toHaveLength(0);
  });

  it('handles namespace import (import * as styles)', () => {
    writeFixture(fixturesDir, 'diag-ns.module.scss', `.container { display: flex; }`);

    const tsContent = `
import * as styles from './diag-ns.module.scss';
const x = styles.container;
const y = styles.nonExistent;
`;
    const program = createProgram(fixturesDir, {
      'diag-ns.module.scss': `.container { display: flex; }`,
      'diag-ns-test.tsx': tsContent,
    });

    const tsFile = path.join(fixturesDir, 'diag-ns-test.tsx');
    const diagnostics = getCssModuleDiagnostics(ts, tsFile, program, tracker);

    const undefinedDiags = diagnostics.filter(d => d.code === 100001);
    expect(undefinedDiags).toHaveLength(1);
    expect(undefinedDiags[0].messageText).toContain('nonExistent');
  });

  it('handles aliased destructuring', () => {
    writeFixture(fixturesDir, 'diag-alias.module.scss', `.container { display: flex; }\n.header { color: red; }`);

    const tsContent = `
import styles from './diag-alias.module.scss';
const { container: cont, header: hdr } = styles;
`;
    const program = createProgram(fixturesDir, {
      'diag-alias.module.scss': `.container { display: flex; }\n.header { color: red; }`,
      'diag-alias-test.tsx': tsContent,
    });

    const tsFile = path.join(fixturesDir, 'diag-alias-test.tsx');
    const diagnostics = getCssModuleDiagnostics(ts, tsFile, program, tracker);

    const unusedDiags = diagnostics.filter(d => d.code === 100002);
    expect(unusedDiags).toHaveLength(0);
  });

  it('cross-file unused detection with multiple importers', () => {
    const scssContent = `.classA { display: flex; }\n.classB { color: red; }\n.classC { font-size: 14px; }`;
    writeFixture(fixturesDir, 'diag-multi-import.module.scss', scssContent);

    const tsA = `
import styles from './diag-multi-import.module.scss';
const x = styles.classA;
`;
    const tsB = `
import styles from './diag-multi-import.module.scss';
const x = styles.classB;
`;
    const program = createProgram(fixturesDir, {
      'diag-multi-import.module.scss': scssContent,
      'diag-multi-import-a.tsx': tsA,
      'diag-multi-import-b.tsx': tsB,
    });

    // Analyze both files so the tracker sees usages from both
    const tsFileA = path.join(fixturesDir, 'diag-multi-import-a.tsx');
    const tsFileB = path.join(fixturesDir, 'diag-multi-import-b.tsx');
    getCssModuleDiagnostics(ts, tsFileA, program, tracker);
    getCssModuleDiagnostics(ts, tsFileB, program, tracker);

    // classA used by file A, classB used by file B — only classC is unused
    const scssPath = path.join(fixturesDir, 'diag-multi-import.module.scss');
    const unused = tracker.getUnusedClasses(scssPath);
    expect(unused).toEqual(['classC']);
  });
});
