import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import ts from 'typescript';
import { getCssModuleCompletions } from '../src/completions';
import { UsageTracker } from '../src/usage-tracker';
import { writeFixture, createProgram } from './test-helpers';

const fixturesDir = path.join(__dirname, 'fixtures', 'completions');

describe('getCssModuleCompletions', () => {
  let tracker: UsageTracker;

  beforeEach(() => {
    fs.rmSync(fixturesDir, { recursive: true, force: true });
    fs.mkdirSync(fixturesDir, { recursive: true });
    tracker = new UsageTracker();
  });

  it('returns class names when typing after styles.', () => {
    writeFixture(fixturesDir, 'comp.module.scss', `.container { display: flex; }\n.header { color: red; }`);

    const tsContent = `import styles from './comp.module.scss';\nconst x = styles.c`;
    const program = createProgram(fixturesDir, {
      'comp.module.scss': `.container { display: flex; }\n.header { color: red; }`,
      'comp.tsx': tsContent,
    }, { setParents: true });

    const tsFile = path.join(fixturesDir, 'comp.tsx');
    const position = tsContent.length - 1;
    const entries = getCssModuleCompletions(ts as any, tsFile, position, program, tracker);

    expect(entries).not.toBeNull();
    const names = entries!.map(e => e.name);
    expect(names).toContain('container');
    expect(names).toContain('header');
  });

  it('returns all class names regardless of partial match', () => {
    writeFixture(fixturesDir, 'prop.module.scss', `.foo { display: flex; }\n.bar { color: red; }`);

    const tsContent = `import styles from './prop.module.scss';\nconst x = styles.f`;
    const program = createProgram(fixturesDir, {
      'prop.module.scss': `.foo { display: flex; }\n.bar { color: red; }`,
      'prop.tsx': tsContent,
    }, { setParents: true });

    const tsFile = path.join(fixturesDir, 'prop.tsx');
    const position = tsContent.length - 1;
    const entries = getCssModuleCompletions(ts as any, tsFile, position, program, tracker);

    expect(entries).not.toBeNull();
    const names = entries!.map(e => e.name);
    expect(names).toContain('foo');
    expect(names).toContain('bar');
  });

  it('returns null for non-CSS-module imports', () => {
    const tsContent = `import something from './other';\nconst x = something.f`;
    const program = createProgram(fixturesDir, {
      'other.ts': `export default { foo: 1 };`,
      'non-css.tsx': tsContent,
    }, { setParents: true });

    const tsFile = path.join(fixturesDir, 'non-css.tsx');
    const position = tsContent.length - 1;
    const entries = getCssModuleCompletions(ts as any, tsFile, position, program, tracker);

    expect(entries).toBeNull();
  });

  it('returns null for non-existent file', () => {
    const entries = getCssModuleCompletions(
      ts as any,
      path.join(fixturesDir, 'nonexistent.tsx'),
      0,
      createProgram(fixturesDir, { 'empty.tsx': '' }, { setParents: true }),
      tracker,
    );

    expect(entries).toBeNull();
  });

  it('includes ICSS :export properties', () => {
    writeFixture(fixturesDir, 'icss.module.scss', `.container { display: flex; }\n:export { primaryColor: red; }`);

    const tsContent = `import styles from './icss.module.scss';\nconst x = styles.c`;
    const program = createProgram(fixturesDir, {
      'icss.module.scss': `.container { display: flex; }\n:export { primaryColor: red; }`,
      'icss.tsx': tsContent,
    }, { setParents: true });

    const tsFile = path.join(fixturesDir, 'icss.tsx');
    const position = tsContent.length - 1;
    const entries = getCssModuleCompletions(ts as any, tsFile, position, program, tracker);

    expect(entries).not.toBeNull();
    const names = entries!.map(e => e.name);
    expect(names).toContain('container');
    expect(names).toContain('primaryColor');
  });

  it('includes label details with filename', () => {
    writeFixture(fixturesDir, 'label.module.scss', `.myClass { display: flex; }`);

    const tsContent = `import styles from './label.module.scss';\nconst x = styles.m`;
    const program = createProgram(fixturesDir, {
      'label.module.scss': `.myClass { display: flex; }`,
      'label.tsx': tsContent,
    }, { setParents: true });

    const tsFile = path.join(fixturesDir, 'label.tsx');
    const position = tsContent.length - 1;
    const entries = getCssModuleCompletions(ts as any, tsFile, position, program, tracker);

    expect(entries).not.toBeNull();
    expect(entries![0].labelDetails?.description).toBe('label.module.scss');
  });
});
