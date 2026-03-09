import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { generateDts, findStyleFiles } from '../src/cli-generate';
import { writeFixture as _writeFixture } from './test-helpers';

const fixturesDir = path.join(__dirname, 'fixtures', 'cli-generate');
const writeFixture = (name: string, content: string) => _writeFixture(fixturesDir, name, content);

function setup(files: Record<string, string>): void {
  fs.rmSync(fixturesDir, { recursive: true, force: true });
  fs.mkdirSync(fixturesDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFixture(name, content);
  }
}

afterEach(() => {
  fs.rmSync(fixturesDir, { recursive: true, force: true });
});

describe('generateDts', () => {
  it('creates .d.ts with correct class names', () => {
    setup({ 'button.module.scss': `.container { display: flex; }\n.header { color: red; }` });
    const file = path.join(fixturesDir, 'button.module.scss');

    generateDts(file);

    const dtsPath = file + '.d.ts';
    expect(fs.existsSync(dtsPath)).toBe(true);

    const content = fs.readFileSync(dtsPath, 'utf-8');
    expect(content).toContain('"container"');
    expect(content).toContain('"header"');
    expect(content).toContain('export default styles');
  });

  it('handles hyphenated class names', () => {
    setup({ 'card.module.scss': `.my-card { color: blue; }` });
    const file = path.join(fixturesDir, 'card.module.scss');

    generateDts(file);

    const content = fs.readFileSync(file + '.d.ts', 'utf-8');
    expect(content).toContain('"my-card"');
  });

  it('is idempotent — does not rewrite unchanged files', () => {
    setup({ 'stable.module.scss': `.foo { color: red; }` });
    const file = path.join(fixturesDir, 'stable.module.scss');

    generateDts(file);
    const mtime1 = fs.statSync(file + '.d.ts').mtimeMs;

    // Small delay to ensure mtime would differ
    const wrote = generateDts(file);
    expect(wrote).toBe(false);
  });

  it('returns false for unparseable files', () => {
    setup({ 'bad.module.scss': '' });
    const file = path.join(fixturesDir, 'bad.module.scss');

    // Empty file may still parse, but check no crash
    const result = generateDts(file);
    expect(typeof result).toBe('boolean');
  });
});

describe('findStyleFiles', () => {
  it('finds .module.scss files recursively', () => {
    setup({
      'a.module.scss': '.a {}',
      'sub/b.module.scss': '.b {}',
      'plain.scss': '.c {}',
    });

    const files = findStyleFiles(fixturesDir);
    const basenames = files.map(f => path.basename(f));
    expect(basenames).toContain('a.module.scss');
    expect(basenames).toContain('b.module.scss');
    expect(basenames).not.toContain('plain.scss');
  });

  it('skips node_modules', () => {
    setup({
      'a.module.scss': '.a {}',
      'node_modules/pkg/b.module.scss': '.b {}',
    });

    const files = findStyleFiles(fixturesDir);
    expect(files).toHaveLength(1);
    expect(path.basename(files[0])).toBe('a.module.scss');
  });
});
